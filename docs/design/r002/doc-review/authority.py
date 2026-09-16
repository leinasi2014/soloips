"""分析投影文档 sourceAuthority 是否覆盖直接依赖（规范 §7 / 注册表 §6）。

直接依赖 = 该文档正文中的本地 Markdown 链接，且目标路径已登记为某个 documentId
（含 relatedPaths）。未登记的目标（如 .github 模板、未登记 Skill）单列，不混算。
"""
import json
import re
from pathlib import Path

root = Path.cwd()
scan = json.loads(Path('.artifacts/operations/r002-doc-review-20260916/scan.json').read_text(encoding='utf-8'))

# path -> documentId 映射（含 relatedPaths）
path_to_id = {}
for e in scan['registry']['entries']:
    path_to_id[e['path'].replace('\\', '/')] = e['documentId']
    for rp in e.get('relatedPaths', []):
        path_to_id[rp.replace('\\', '/')] = e['documentId']

entries = {e['documentId']: e for e in scan['registry']['entries']}

print('=== PROJECTION sourceAuthority COVERAGE ===')
report = {}
for doc_id, e in entries.items():
    if 'sourceAuthority' not in e:
        continue
    declared = set(e['sourceAuthority'])
    doc_path = e['path']
    # 收集本文档的本地链接目标
    targets = set()
    for l in scan['links']:
        if l['source'].replace('\\', '/') != doc_path.replace('\\', '/'):
            continue
        t = l['dest'].replace('\\', '/')
        targets.add(t)
    depended_ids = set()
    unregistered = set()
    for t in targets:
        did = path_to_id.get(t)
        if did:
            if did != doc_id:
                depended_ids.add(did)
        else:
            unregistered.add(t)
    missing = sorted(depended_ids - declared)
    extra = sorted(declared - depended_ids)
    report[doc_id] = {
        'path': doc_path,
        'declared': sorted(declared),
        'dependedRegisteredIds': sorted(depended_ids),
        'missingFromSourceAuthority': missing,
        'declaredButNotLinked': extra,
        'linkedButUnregistered': sorted(unregistered),
    }
    print('## ' + doc_id + '  (' + doc_path + ')')
    print('   declared      : ' + ', '.join(sorted(declared)))
    print('   depended(reg) : ' + ', '.join(sorted(depended_ids)))
    print('   MISSING       : ' + (', '.join(missing) if missing else '(none)'))
    print('   declared-only : ' + (', '.join(extra) if extra else '(none)'))
    print('   linked-unreg  : ' + (', '.join(sorted(unregistered)) if unregistered else '(none)'))

Path('.artifacts/operations/r002-doc-review-20260916/source-authority.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
