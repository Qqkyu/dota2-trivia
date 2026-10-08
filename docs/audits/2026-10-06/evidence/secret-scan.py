import json
import os
from pathlib import Path
import re
import subprocess

REPO = Path('/home/kulmisiu/dev/dota2-trivia')
OUT = Path('/tmp/queue-arcade-audit-20261006')
MAX_BYTES = 2 * 1024 * 1024

def git(*args, text=False, input=None):
    return subprocess.check_output(['git', '-C', str(REPO), *args], text=text, input=input)

patterns = {
    'private-key-header': re.compile(r'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----'),
    'github-token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'aws-access-key-id': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'slack-token': re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    'google-api-key': re.compile(r'\bAIza[A-Za-z0-9_-]{35}\b'),
    'stripe-secret-key': re.compile(r'\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b'),
    'sendgrid-token': re.compile(r'\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b'),
    'npm-token': re.compile(r'\bnpm_[A-Za-z0-9]{30,}\b'),
    'resend-token': re.compile(r'\bre_[A-Za-z0-9]{30,}\b'),
    'credential-bearing-connection-url': re.compile(r'\b(?:postgres(?:ql)?|mysql|redis(?:s)?|mongodb(?:\+srv)?)://[^\s:@/]+:[^\s@/]+@[^\s\"\x27<>]+'),
}
assignment = re.compile(r'''(?ix)
  ["']?(?P<key>[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|APIKEY|VOTER_SALT)[A-Z0-9_]*)["']?
  \s*[:=]\s*(?P<quote>["']?)(?P<value>[A-Za-z0-9_+/.=:@-]{8,})(?P=quote)
''')

def placeholder(value):
    lower = value.lower()
    needles = ('example', 'placeholder', 'replace', 'changeme', 'change-me', 'dummy', 'validation', 'local-', 'for-tests', 'test-', 'test_', 'smoke', 'audit-', 'your-', 'ci-')
    if any(word in lower for word in needles):
        return True
    return lower in ('postgres', 'password', 'process.env', 'undefined') or len(set(value)) <= 2

def scan(data, path, source, object_id=None):
    if b'\0' in data or len(data) > MAX_BYTES:
        return [], 'binary' if b'\0' in data else 'size'
    try:
        content = data.decode('utf-8')
    except UnicodeDecodeError:
        return [], 'encoding'
    found = []
    for line_number, line in enumerate(content.splitlines(), 1):
        for kind, pattern in patterns.items():
            for match in pattern.finditer(line):
                found.append({'file': path, 'source': source, 'line': line_number, 'pattern': kind, 'classification': 'placeholder-like' if placeholder(match.group()) else 'needs-review', **({'blob':object_id} if object_id else {})})
        for match in assignment.finditer(line):
            value = match.group('value')
            # References are code, not embedded credential values.
            if value.startswith(('process.', 'env.', 'import.', 'String', 'Boolean')):
                continue
            found.append({'file': path, 'source': source, 'line': line_number, 'pattern': 'credential-assignment', 'key': match.group('key'), 'classification': 'placeholder-like' if placeholder(value) else 'needs-review', **({'blob':object_id} if object_id else {})})
    return found, 'text'

stats = {'current':{}, 'history':{}}
current_findings = []
paths = git('ls-files', '-z').decode().split('\0')
for name in filter(None, paths):
    file = REPO / name
    if file.is_symlink() or not file.is_file():
        continue
    if file.stat().st_size > MAX_BYTES:
        stats['current']['size'] = stats['current'].get('size', 0) + 1
        continue
    findings, result = scan(file.read_bytes(), name, 'working-tree')
    current_findings.extend(findings)
    stats['current'][result] = stats['current'].get(result, 0) + 1

object_paths = {}
for line in git('rev-list', '--objects', '--all', text=True).splitlines():
    fields = line.split(' ', 1)
    if len(fields) == 2:
        object_paths[fields[0]] = fields[1]

metadata = git('cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)', input=('\n'.join(object_paths)+'\n').encode()).decode().splitlines()
history_findings = []
for item in metadata:
    oid, kind, size = item.split()
    if kind != 'blob':
        continue
    if int(size) > MAX_BYTES:
        stats['history']['size'] = stats['history'].get('size', 0) + 1
        continue
    findings, result = scan(git('cat-file', 'blob', oid), object_paths[oid], 'git-history', oid)
    history_findings.extend(findings)
    stats['history'][result] = stats['history'].get(result, 0) + 1

for finding in current_findings:
    finding['commit'] = 'working-tree'
for finding in history_findings:
    # An introducing history commit is enough for follow-up, without displaying contents.
    commits = git('log', '--all', '--format=%H', '--find-object='+finding['blob'], text=True).splitlines()
    finding['commit'] = commits[-1] if commits else 'unresolved'

environment_history = []
env_paths = sorted({p for p in object_paths.values() if re.search(r'(^|/)\.env(?:\.|$)', p)})
for name in env_paths:
    commits = git('log', '--all', '--format=%H', '--', name, text=True).splitlines()
    environment_history.append({'file':name, 'commit_count':len(commits), 'earliest_change_commit':commits[-1] if commits else None})

result = {
    'commits': int(git('rev-list', '--count', '--all', text=True)),
    'max_blob_bytes': MAX_BYTES,
    'stats':stats,
    'environment_history':environment_history,
    'current_findings':current_findings,
    'history_findings':history_findings,
}
(OUT / 'secret-scan-results.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ('current_findings','history_findings')}, indent=2))
print(json.dumps({'current_candidates':len(current_findings), 'history_candidates':len(history_findings), 'non_placeholder_candidates':[f for f in current_findings+history_findings if f['classification']=='needs-review']}, indent=2))
