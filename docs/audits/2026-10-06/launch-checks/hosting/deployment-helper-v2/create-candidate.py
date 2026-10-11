import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path('/home/kulmisiu/dev/dota2-trivia')
OUT = Path('/tmp/queue-arcade-launch-checks')
BASE = '7528a842754642d249640531df3f6fc91bf032b9'
REF = 'refs/heads/codex/launch-checks-20261006'

def git(*args, env=None, text=True):
    return subprocess.check_output(['git', *args], cwd=ROOT, env=env, text=text).strip()

assert git('rev-parse', 'HEAD') == BASE, 'Working checkout moved; review before committing.'
index_path = ROOT / '.git/index'
index_before = hashlib.sha256(index_path.read_bytes()).hexdigest()
branch = subprocess.run(['git', 'rev-parse', '--verify', REF], cwd=ROOT, capture_output=True, text=True)
parent = branch.stdout.strip() if branch.returncode == 0 else BASE
previous = parent if branch.returncode == 0 else '0' * 40
fd, name = tempfile.mkstemp(prefix='candidate-index-', dir=OUT)
os.close(fd)
Path(name).unlink()
env = {**os.environ, 'GIT_INDEX_FILE': name}
try:
    git('read-tree', parent, env=env)
    git('add', '--all', '--', '.', env=env)
    paths = git('ls-files', '-z', env=env, text=False).split(b'\0')
    paths = [p.decode() for p in paths if p]
    forbidden = [p for p in paths if p.startswith(('.local-assets/', '.data/', '.next', 'node_modules/')) or (Path(p).name.startswith('.env') and p != '.env.example')]
    assert not forbidden, 'Private or generated paths entered the release index.'
    check = subprocess.run(['git', 'diff', '--cached', '--check', '--', '.', ':(exclude)docs/audits/**', ':(exclude)patches/**'], cwd=ROOT, env=env, capture_output=True, text=True)
    (OUT / 'candidate-whitespace.log').write_text(check.stdout)
    assert check.returncode == 0, 'Whitespace check failed; inspect private diagnostic file.'
    tree = git('write-tree', env=env)
    message = OUT / 'candidate-commit-message.txt'
    message.write_text('Audit and harden Queue Arcade for a verified preview release\n\nReview playable content, secure authentication and persistence, repair gameplay and accessibility, and add release checks with reproducible evidence.\n')
    commit = git('commit-tree', tree, '-p', parent, '-F', str(message), env=env)
    git('update-ref', REF, commit, previous)
    assert hashlib.sha256(index_path.read_bytes()).hexdigest() == index_before, 'User index changed unexpectedly.'
    result = {'commit': commit, 'tree': tree, 'parent': parent, 'branch': REF.removeprefix('refs/heads/'), 'files': len(paths), 'workingHead': BASE, 'originalIndexUnchanged': True}
    (OUT / 'candidate-commit.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
finally:
    Path(name).unlink(missing_ok=True)
