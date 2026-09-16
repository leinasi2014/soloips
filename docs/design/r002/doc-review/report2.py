import json
from pathlib import Path

d = json.loads(Path('.artifacts/operations/r002-doc-review-20260916/scan.json').read_text(encoding='utf-8'))

print('=== STABLE IDs per doc (id -> lines) ===')
for k, v in d['stableIds'].items():
    print('## ' + k + '  (' + str(len(v)) + ' distinct)')
    for i, lines in v.items():
        print('   ' + i + ' -> ' + str(lines[:6]))

print()
print('=== SUPERSEDE MENTIONS ===')
for k, v in d['supersedeMentions'].items():
    print('## ' + k)
    for e in v:
        print('   L' + str(e['line']) + ': ' + e['text'])
