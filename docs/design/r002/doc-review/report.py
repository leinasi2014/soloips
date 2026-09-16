import json
from pathlib import Path

d = json.loads(Path('.artifacts/operations/r002-doc-review-20260916/scan.json').read_text(encoding='utf-8'))

print('=== LABEL STATS ===')
for k, v in d['labelStats'].items():
    print(k + ': ' + json.dumps(v['counts'], ensure_ascii=False))
    if v['unknownTags']:
        print('   UNKNOWN TAGS: ' + json.dumps(v['unknownTags'], ensure_ascii=False))

print()
print('=== CONTRACT TABLES ===')
for k, v in d['contract'].items():
    if not v.get('exists'):
        print(k + ': MISSING FILE')
        continue
    print(k)
    print('   tableLine=' + str(v['contractTableLine']) + ' fields=' + json.dumps(v['contractTableFields'], ensure_ascii=False))

print()
print('=== BROKEN LINKS ===')
print(json.dumps(d['brokenLinks'], ensure_ascii=False, indent=2))

print()
print('=== ABS PATH HITS ===')
print(json.dumps(d['absolutePathHits'], ensure_ascii=False, indent=2))

print()
print('=== CRED HITS ===')
print(json.dumps(d['credentialHits'], ensure_ascii=False, indent=2))

print()
print('=== REGISTRY ENTRIES ===')
for e in d['registry']['entries']:
    print(json.dumps(e, ensure_ascii=False))
