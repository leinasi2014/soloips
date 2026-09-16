"""查找应以仓库相对链接书写、却写成行内代码的项目内路径（规范 §6）。"""
import re
from pathlib import Path

root = Path.cwd()
DOCS = [
    'AGENTS.md',
    'docs/architecture.md',
    'docs/technical-architecture.md',
    'docs/decisions/official-team-and-dsh-fork.md',
    'docs/governance/agent-readable-documentation.md',
    'docs/governance/code-development-standard.md',
    'docs/operations/development-iterations.md',
    'docs/operations/environment-handoff.md',
    'docs/reference/rewrite-source-reference.md',
    'docs/reference/rewrite-domain-storage.md',
    'docs/reference/rewrite-seam-client.md',
    'docs/reference/rewrite-test-contract.md',
    'profiles/development/README.md',
    '.agents/skills/dsh-plugin-development/SKILL.md',
    '.agents/skills/team-delivery-leadership/SKILL.md',
    '.agents/skills/team-delivery-leadership/references/soloips-development.md',
]

# 行内代码里像仓库内相对路径的片段
CODE = re.compile(r'`([^`]+)`')
PATHLIKE = re.compile(r'^(?:\.\./)*(?:docs|profiles|scripts|packages|\.agents|\.github|\.artifacts)/[A-Za-z0-9._/\-]+\.(?:md|yaml|yml|json|ps1|mjs|cjs|ts)$')

print('=== 行内代码形式的项目内路径（未用 Markdown 链接）===')
total = 0
per_file = {}
for name in DOCS:
    p = root / name
    if not p.is_file():
        print('MISSING: ' + name)
        continue
    hits = []
    for lineno, ln in enumerate(p.read_text(encoding='utf-8').splitlines(), start=1):
        # 已作为链接目标的路径不算
        link_targets = set(re.findall(r'\]\(([^)]+)\)', ln))
        for m in CODE.finditer(ln):
            frag = m.group(1).strip()
            if PATHLIKE.match(frag):
                if any(frag in t for t in link_targets):
                    continue
                hits.append((lineno, frag))
    if hits:
        per_file[name] = hits
        print('## ' + name + '  (' + str(len(hits)) + ')')
        for lineno, frag in hits:
            print('   L' + str(lineno) + ': `' + frag + '`')
        total += len(hits)

print()
print('TOTAL inline-code internal paths: ' + str(total))
print('Files affected: ' + str(len(per_file)))
