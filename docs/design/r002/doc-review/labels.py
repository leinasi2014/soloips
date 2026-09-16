"""提取全部 〔…〕 标注，判定是否属于规范 §2 的规范取值，并列出非规范标注的行号。"""
import json
import re
from pathlib import Path

root = Path.cwd()
scan = json.loads(Path('.artifacts/operations/r002-doc-review-20260916/scan.json').read_text(encoding='utf-8'))

CANON = {
    '决策': ['需求', '约束', '建议', '待决', '已取代'],
    '证据': ['源码事实', '推断', '未验证'],
    '交付': ['提案', '已实现', '已验证', '已集成'],
}
ALL_CANON = [v for vs in CANON.values() for v in vs]
LABEL_RE = re.compile(r'〔([^〕]+)〕')

print('=== 非规范标注（去掉规范取值前缀与 ID/来源后缀后仍不属于 §2 枚举）===')
rows = []
for name in sorted(scan['contract']):
    if not scan['contract'][name].get('exists'):
        continue
    p = root / name
    for lineno, ln in enumerate(p.read_text(encoding='utf-8').splitlines(), start=1):
        for m in LABEL_RE.finditer(ln):
            raw = m.group(1).strip()
            # 规范取值可能带 ", SOLO-xx" / " DRAFT-xx" / "，来源" 后缀
            head = re.split(r'[，,、\s]', raw, maxsplit=1)[0]
            if head in ALL_CANON:
                continue
            rows.append({'source': name, 'line': lineno, 'label': raw, 'text': ln.strip()[:180]})

for r in rows:
    print(r['source'] + ':' + str(r['line']) + '  〔' + r['label'] + '〕')
    print('    ' + r['text'])

print()
print('TOTAL non-canonical label occurrences: ' + str(len(rows)))
Path('.artifacts/operations/r002-doc-review-20260916/noncanonical-labels.json').write_text(
    json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
