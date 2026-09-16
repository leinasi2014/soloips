"""r002 文档校对审查：机械扫描器（只读）。

本脚本是审查辅助，不是新的项目验证器（规范 §9：不为散文新建只数标题或比对措辞的验证器）。
它只提取可机械判定的事实，供人工审查定位行号：
  1. 阅读契约表存在性与字段齐备性
  2. 本地 Markdown 链接可达性
  3. 机器绝对路径 / 凭据样式字面量
  4. 三类标注标签的分布与未标注的规范关键词
  5. 稳定 ID 出现与重复
  6. 注册表登记项与文件系统一致性
输出 JSON 到同目录 scan.json。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

root = Path.cwd()
out = Path(__file__).parent

REGISTRY = root / 'docs/governance/document-registry.yaml'

# ---- 解析注册表（受限映射布局，与既有检查器同口径，另取 role/relatedPaths/sourceAuthority）----
documents = []
current = None
list_key = None
for line in REGISTRY.read_text(encoding='utf-8').splitlines():
    if not line.strip() or line.startswith('#'):
        continue
    m = re.fullmatch(r'  - documentId: ([a-z0-9-]+)', line)
    if m:
        current = {'documentId': m.group(1)}
        documents.append(current)
        list_key = None
        continue
    m = re.fullmatch(r'    ([A-Za-z][A-Za-z0-9]*):(?: (.*))?', line)
    if m:
        key, value = m.groups()
        if value is None:
            current[key] = []
            list_key = key
        elif value.startswith('['):
            current[key] = [v.strip() for v in value[1:-1].split(',')]
            list_key = None
        else:
            current[key] = value
            list_key = None
        continue
    m = re.fullmatch(r'      - (\S+)', line)
    if m:
        current[list_key].append(m.group(1))
        continue

ids = [d['documentId'] for d in documents]

# ---- 阅读契约表 ----
CONTRACT_FIELDS = ['身份', '目的', '范围', '决策状态', '证据范围', '依据', '变更权']
# 规范 §1 与注册表 §1 的措辞差异：agent-readable-documentation.md 正文用「实现证据」，
# 既有文档多用「证据范围」。两者都算同一字段。
CONTRACT_ALIASES = {'证据范围': ['证据范围', '实现证据', '证据']}

contract = {}
for item in documents:
    for name in [item['path']] + item.get('relatedPaths', []):
        if not name.endswith('.md'):
            continue
        p = root / name
        if not p.is_file():
            contract[name] = {'exists': False}
            continue
        text = p.read_text(encoding='utf-8')
        lines = text.splitlines()
        # 定位「阅读契约」表：表头行 | 阅读契约 | 内容 |（可能在 ## 1. 阅读契约 之下）
        table_start = None
        for i, ln in enumerate(lines, start=1):
            if re.match(r'^\|\s*阅读契约\s*\|\s*内容\s*\|', ln):
                table_start = i
                break
        # 契约表体：从表头起，直到空行或非表格行
        body = []
        if table_start:
            for ln in lines[table_start:]:
                if not ln.startswith('|'):
                    break
                body.append(ln)
        # 表头单元格出现在行首的 "| 身份 |"
        present = {}
        for field in CONTRACT_FIELDS:
            names = CONTRACT_ALIASES.get(field, [field])
            hit = None
            for i, ln in enumerate(lines, start=1):
                for nm in names:
                    if re.match(rf'^\|\s*{re.escape(nm)}\s*\|', ln):
                        hit = i
                        break
                if hit:
                    break
            present[field] = hit
        contract_table_line = table_start
        contract_fields_in_table = []
        if table_start:
            for ln in body:
                m = re.match(r'^\|\s*([^|]+?)\s*\|', ln)
                if m:
                    contract_fields_in_table.append(m.group(1).strip())
        contract[name] = {
            'exists': True,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
            'contractTableLine': contract_table_line,
            'contractTableFields': contract_fields_in_table,
            'hasContractTable': table_start is not None,
            'fields': present,
            'missingFields': [f for f, v in present.items() if v is None],
        }

# ---- 本地链接 ----
links = []
for name in sorted(contract):
    if not contract[name].get('exists'):
        continue
    p = root / name
    text = p.read_text(encoding='utf-8')
    # 去掉代码块
    stripped = re.sub(r'(```|~~~)[^\n]*\n.*?\1', '', text, flags=re.S)
    for lineno, ln in enumerate(stripped.splitlines(), start=1):
        for m in re.finditer(r'\[[^\]]*\]\(([^)]+)\)', ln):
            target = m.group(1).strip('<>')
            uri = target.split('#')[0]
            if not uri or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', uri) or uri.startswith('//'):
                continue
            from urllib.parse import unquote
            dest = (p.parent / unquote(uri)).resolve()
            links.append({
                'source': name, 'line': lineno, 'target': target,
                'resolves': dest.is_file(),
                'dest': str(dest.relative_to(root)) if str(dest).startswith(str(root)) else str(dest),
            })

# ---- 机器绝对路径 / 凭据 ----
ABS_PATH = re.compile(r'(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\[A-Za-z0-9._-]+\\|/(?:home|Users|mnt|opt|srv)/[A-Za-z0-9._-]+)')
CRED = re.compile(r'(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|api[_-]?key\s*[:=]\s*["\']?[A-Za-z0-9_-]{16,}|ANTHROPIC_API_KEY\s*=|OPENAI_API_KEY\s*=|password\s*[:=]\s*\S{6,})', re.I)
abs_hits = []
cred_hits = []
for name in sorted(contract):
    if not contract[name].get('exists'):
        continue
    p = root / name
    text = p.read_text(encoding='utf-8')
    stripped = re.sub(r'(```|~~~)[^\n]*\n.*?\1', '', text, flags=re.S)
    for lineno, ln in enumerate(stripped.splitlines(), start=1):
        for m in ABS_PATH.finditer(ln):
            abs_hits.append({'source': name, 'line': lineno, 'match': m.group(0), 'text': ln.strip()[:200]})
        for m in CRED.finditer(ln):
            cred_hits.append({'source': name, 'line': lineno, 'match': m.group(0)[:40], 'text': ln.strip()[:200]})

# ---- 三类标注 ----
DECISION = ['需求', '约束', '建议', '待决', '已取代']
EVIDENCE = ['源码事实', '推断', '未验证']
DELIVERY = ['提案', '已实现', '已验证', '已集成']
LABEL_RE = re.compile(r'〔([^〕]+)〕')
label_stats = {}
for name in sorted(contract):
    if not contract[name].get('exists'):
        continue
    p = root / name
    text = p.read_text(encoding='utf-8')
    counts = {}
    unknown = {}
    for lineno, ln in enumerate(text.splitlines(), start=1):
        for m in LABEL_RE.finditer(ln):
            tag = m.group(1).strip()
            counts[tag] = counts.get(tag, 0) + 1
            if tag not in DECISION + EVIDENCE + DELIVERY:
                unknown.setdefault(tag, []).append(lineno)
    label_stats[name] = {'counts': counts, 'unknownTags': {k: v[:10] for k, v in unknown.items()}}

# ---- 稳定 ID ----
ID_RE = re.compile(r'\b((?:SOLO|DEPT|ORG|AVATAR|ARCH|DEV|ENV|DEVENV|MECH|SEAM|REG|ACC|TEAM|DSH)[A-Z]*-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b')
id_stats = {}
for name in sorted(contract):
    if not contract[name].get('exists'):
        continue
    p = root / name
    text = p.read_text(encoding='utf-8')
    seen = {}
    for lineno, ln in enumerate(text.splitlines(), start=1):
        for m in ID_RE.finditer(ln):
            seen.setdefault(m.group(1), []).append(lineno)
    id_stats[name] = {k: v[:12] for k, v in sorted(seen.items())}

# 被取代关系
supersede = {}
for name in sorted(contract):
    if not contract[name].get('exists'):
        continue
    p = root / name
    for lineno, ln in enumerate(p.read_text(encoding='utf-8').splitlines(), start=1):
        if '已取代' in ln or '取代' in ln:
            supersede.setdefault(name, []).append({'line': lineno, 'text': ln.strip()[:220]})

result = {
    'registry': {
        'documentCount': len(documents),
        'documentIds': ids,
        'duplicateIds': [i for i in set(ids) if ids.count(i) > 1],
        'pathMissing': [n for d in documents for n in [d['path']] + d.get('relatedPaths', []) if not (root / n).is_file()],
        'unregisteredSources': [
            {'document': d['documentId'], 'source': s}
            for d in documents for s in d.get('sourceAuthority', []) if s not in ids
        ],
        'entries': [{k: v for k, v in d.items()} for d in documents],
    },
    'contract': contract,
    'links': links,
    'brokenLinks': [l for l in links if not l['resolves']],
    'absolutePathHits': abs_hits,
    'credentialHits': cred_hits,
    'labelStats': label_stats,
    'stableIds': id_stats,
    'supersedeMentions': supersede,
}
(out / 'scan.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

print(json.dumps({
    'registryDocuments': len(documents),
    'duplicateIds': result['registry']['duplicateIds'],
    'pathMissing': result['registry']['pathMissing'],
    'unregisteredSources': result['registry']['unregisteredSources'],
    'brokenLinks': len(result['brokenLinks']),
    'absolutePathHits': len(abs_hits),
    'credentialHits': len(cred_hits),
    'docsMissingContractTable': [k for k, v in contract.items() if v.get('exists') and not v['hasContractTable']],
    'docsWithIncompleteContract': {k: v['missingFields'] for k, v in contract.items() if v.get('exists') and v['hasContractTable'] and v['missingFields']},
}, ensure_ascii=False, indent=2))
