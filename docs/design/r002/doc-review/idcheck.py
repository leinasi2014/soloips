"""检查稳定 ID 的定义唯一性：同一 ID 是否在多个文档/多处被"定义"（表格行首或行首加粗）。"""
import json
import re
from pathlib import Path

root = Path.cwd()
scan = json.loads(Path('.artifacts/operations/r002-doc-review-20260916/scan.json').read_text(encoding='utf-8'))

ID_RE = re.compile(r'\b((?:SOLO|DEPT|ORG|AVATAR|ARCH|DEV|ENV|DEVENV|MECH|SEAM|REG|ACC|TEAM|DSH|CLIENT|PKG|TC|TERM|DRAFT|C)[A-Z]*-[A-Z0-9]+(?:-[A-Z0-9]+)*)\b')

# 定义位置：表格行首 "| ID | ..." 或行首 "**〔...ID〕**" / "ID〔标签〕"
defs = {}
for name in sorted(scan['contract']):
    if not scan['contract'][name].get('exists'):
        continue
    p = root / name
    for lineno, ln in enumerate(p.read_text(encoding='utf-8').splitlines(), start=1):
        s = ln.strip()
        m = re.match(r'^\|\s*([A-Z][A-Z0-9-]*-[A-Z0-9-]+)\s*\|', s)
        if m:
            defs.setdefault(m.group(1), []).append((name, lineno, 'table-row'))
            continue
        m = re.match(r'^([A-Z][A-Z0-9-]*-[A-Z0-9-]+)\s*〔', s)
        if m:
            defs.setdefault(m.group(1), []).append((name, lineno, 'inline-head'))
            continue
        m = re.match(r'^([A-Z][A-Z0-9-]*-[A-Z0-9-]+)\s+(?=[A-Za-z\u4e00-\u9fff])', s)
        if m:
            defs.setdefault(m.group(1), []).append((name, lineno, 'bare-head'))

print('=== IDs DEFINED IN MORE THAN ONE PLACE ===')
dups = 0
for k, v in sorted(defs.items()):
    files = {x[0] for x in v}
    if len(v) > 1:
        dups += 1
        print(k + '  -> ' + str(len(v)) + ' definition sites across ' + str(len(files)) + ' file(s)')
        for f, l, kind in v:
            print('     ' + f + ':' + str(l) + '  (' + kind + ')')
print('TOTAL multi-defined IDs: ' + str(dups))

print()
print('=== IDs DEFINED IN >1 FILE (possible cross-document collision) ===')
for k, v in sorted(defs.items()):
    files = {x[0] for x in v}
    if len(files) > 1:
        print(k + ' -> ' + ', '.join(sorted(files)))

print()
print('=== SYMBOL ENV NAMES USED IN REGISTERED DOCS ===')
SYM = re.compile(r'`([A-Z][A-Z0-9_]{4,})`')
usage = {}
for name in sorted(scan['contract']):
    if not scan['contract'][name].get('exists'):
        continue
    p = root / name
    for lineno, ln in enumerate(p.read_text(encoding='utf-8').splitlines(), start=1):
        for m in SYM.finditer(ln):
            usage.setdefault(m.group(1), set()).add(name)
for k in sorted(usage):
    print(k + '  <- ' + ', '.join(sorted(usage[k])))
