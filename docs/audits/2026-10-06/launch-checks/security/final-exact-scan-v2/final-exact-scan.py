#!/usr/bin/env python3
"""Scan an exact evidence commit. Credentials stay in memory; Git stays unchanged."""
import argparse
import copy
import datetime
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import stat
import subprocess
import sys
import tarfile
import urllib.parse

try:
    import tomllib
except ImportError:
    from pip._vendor import tomli as tomllib

GITLEAKS_SHA = '88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509'
CONFIG_SHA = 'e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf'
MAX_BLOB = 100 * 1024 * 1024
MAX_TOTAL = 1024 * 1024 * 1024
MAX_DECODED = 64 * 1024 * 1024
MAX_DECODED_TOTAL = 256 * 1024 * 1024
SECRET_KEYS = {'ARCADE_AUTH_SECRET', 'ARCADE_VOTER_SALT', 'STEAM_API_KEY', 'STEAM_WEB_API_KEY', 'DATABASE_URL'}
REQUIRED_SECRET_KEYS = {'ARCADE_AUTH_SECRET', 'ARCADE_VOTER_SALT', 'STEAM_WEB_API_KEY', 'DATABASE_URL'}
REASONS = {'sha256-manifest-digest', 'public-source-field', 'public-asset-filename',
           'synthetic-test-value', 'variable-name-assertion', 'artifact-reference',
           'other-reviewed-nonsecret'}
FIELDS = ('RuleID', 'StartLine', 'EndLine', 'StartColumn', 'EndColumn')
GIT_ENV = {'PATH': '/usr/bin:/bin', 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
           'GIT_OPTIONAL_LOCKS': '0', 'GIT_TERMINAL_PROMPT': '0', 'GIT_NO_REPLACE_OBJECTS': '1',
           'LC_ALL': 'C'}


class ScanError(Exception):
    pass


def require(condition, code):
    if not condition:
        raise ScanError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def run(argv, *, env, timeout=20, limit=2_000_000):
    try:
        result = subprocess.run(argv, env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise ScanError('COMMAND_FAILED') from None
    require(len(result.stdout) <= limit and len(result.stderr) <= limit, 'COMMAND_OUTPUT_LIMIT')
    require(result.returncode == 0 and not result.stderr, 'COMMAND_FAILED')
    return result.stdout


def git(repo, *args, limit=2_000_000):
    return run(['/usr/bin/git', '-C', str(repo), *args], env=GIT_ENV, limit=limit)


def private_file(path, limit=2_000_000, original_env=False):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and not path.is_symlink(), 'PRIVATE_INPUT_TYPE')
    forbidden_permissions = 0o022 if original_env else 0o077
    require(info.st_uid == os.getuid() and info.st_mode & forbidden_permissions == 0, 'PRIVATE_INPUT_PERMISSIONS')
    require(info.st_size <= limit, 'PRIVATE_INPUT_SIZE')
    raw = path.read_bytes()
    require(len(raw) <= limit, 'PRIVATE_INPUT_SIZE')
    return raw


def configured_secrets(env_file, recovery, repo):
    values, keys = set(), set()
    def add(key, value):
        if key not in SECRET_KEYS:
            return
        require(isinstance(value, str) and value and len(value) <= 16384, 'APP_SECRET_VALUE')
        keys.add(key)
        values.add(value.encode())
        if key == 'DATABASE_URL':
            url = urllib.parse.urlparse(value)
            require(url.scheme in ('postgres', 'postgresql') and url.password, 'DATABASE_SECRET_VALUE')
            values.add(urllib.parse.unquote(url.password).encode())
    def walk(value):
        if isinstance(value, dict):
            if isinstance(value.get('key'), str):
                add(value['key'], value.get('value'))
            for key, child in value.items():
                add(key, child)
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    original_env = env_file.absolute() == repo / '.env.local'
    for line in private_file(env_file, original_env=original_env).decode().splitlines():
        match = re.fullmatch(r'\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*', line)
        if match:
            value = match[2]
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '\"\'':
                value = value[1:-1]
            add(match[1], value)
    info = recovery.lstat()
    require(stat.S_ISDIR(info.st_mode) and not recovery.is_symlink() and info.st_uid == os.getuid()
            and info.st_mode & 0o077 == 0,
            'RECOVERY_DIRECTORY_PERMISSIONS')
    for name in ('runtime-verified.json', 'environment-before.json'):
        walk(json.loads(private_file(recovery / name)))
    require(REQUIRED_SECRET_KEYS.issubset(keys), 'APP_SECRET_KEYS_MISSING')
    require(all(len(value) >= 16 for value in values), 'APP_SECRET_TOO_SHORT')
    return values


def hosting_secrets(gh_bin):
    render = os.environ.get('RENDER_API_KEY', '')
    require(len(render) >= 16 and len(render) <= 16384, 'RENDER_SECRET_MISSING')
    env = {'PATH': '/usr/bin:/bin', 'GH_PROMPT_DISABLED': '1', 'GH_PAGER': 'cat'}
    for key in ('HOME', 'XDG_CONFIG_HOME', 'GH_CONFIG_DIR', 'GH_TOKEN', 'GITHUB_TOKEN'):
        if key in os.environ:
            env[key] = os.environ[key]
    token = run([str(gh_bin), 'auth', 'token', '--hostname', 'github.com'], env=env,
                timeout=10, limit=16384).strip()
    require(16 <= len(token) <= 16384 and b'\n' not in token and b'\r' not in token,
            'GITHUB_SECRET_MISSING')
    result = {render.encode(), token}
    require(len(result) == 2, 'HOSTING_SECRET_COUNT')
    return result


def secret_patterns(values):
    patterns = set(values)
    for value in values:
        text = value.decode()
        patterns.add(urllib.parse.quote(text, safe='').encode())
        patterns.add(json.dumps(text, ensure_ascii=False)[1:-1].encode())
    return patterns


def derived_config(raw):
    require(sha(raw) == CONFIG_SHA, 'GITLEAKS_CONFIG_HASH')
    source = raw.decode()
    head, separator, tail = source.partition('[[rules]]')
    require(separator and head.count('[allowlist]') == 1, 'CONFIG_SECTION')
    replacement, count = re.subn(r'(?ms)^paths = \[\n.*?^\]\n', 'paths = []\n', head)
    require(count == 1, 'CONFIG_PATH_LIST')
    result = replacement + separator + tail
    expected = copy.deepcopy(tomllib.loads(source))
    require(isinstance(expected['allowlist']['paths'], list), 'CONFIG_PATH_LIST')
    expected['allowlist']['paths'] = []
    require(tomllib.loads(result) == expected, 'CONFIG_UNEXPECTED_CHANGE')
    return result.encode()


def safe_relative(name):
    require(isinstance(name, str) and name and '\\' not in name and '\0' not in name,
            'UNSAFE_PATH')
    path = PurePosixPath(name)
    require(not path.is_absolute() and str(path) == name and '..' not in path.parts,
            'UNSAFE_PATH')
    require(all(ord(char) >= 32 and ord(char) != 127 for char in name), 'UNSAFE_PATH')
    return path


def forbidden_path(name):
    path = safe_relative(name)
    parts = path.parts
    if any(part in {'.git', '.data', '.local-assets', '.aws', 'node_modules', '__pycache__'}
           or part.startswith('.next') for part in parts):
        return True
    if any(part.startswith('.env') for part in parts) and name != '.env.example':
        return True
    return bool(re.search(r'(?:^|/)(?:private-render-backup|render-productionize-private|operator-recovery[^/]*|.*owned-guest.*)(?:/|$)', name)
                or name.endswith(('.dump', '.backup', '.sql.gz', '.pgpass', '.pem', '.key')))


def repository_state(repo, release_ref):
    head = git(repo, 'rev-parse', '--verify', 'HEAD').decode().strip()
    index_name = git(repo, 'rev-parse', '--git-path', 'index').decode().strip()
    index = Path(index_name)
    if not index.is_absolute():
        index = repo / index
    return {'head': head, 'indexSha256': sha(index.read_bytes()) if index.exists() else None,
            'releaseRef': release_ref,
            'releaseCommit': git(repo, 'rev-parse', '--verify', release_ref).decode().strip()}


def tree_entries(repo, commit):
    require(re.fullmatch(r'[0-9a-f]{40}', commit) is not None, 'COMMIT_FORMAT')
    require(git(repo, 'rev-parse', '--verify', commit + '^{commit}').decode().strip() == commit,
            'COMMIT_NOT_EXACT')
    rows = []
    for raw in git(repo, 'ls-tree', '-r', '-z', '--full-tree', commit, limit=8_000_000).split(b'\0'):
        if not raw:
            continue
        meta, name = raw.split(b'\t', 1)
        mode, kind, oid = meta.decode().split()
        name = name.decode()
        safe_relative(name)
        require(mode in ('100644', '100755') and kind == 'blob', 'NONREGULAR_GIT_ENTRY')
        require(re.fullmatch(r'[0-9a-f]{40}', oid) is not None, 'GIT_OBJECT_FORMAT')
        require(not forbidden_path(name), 'FORBIDDEN_CANDIDATE_PATH')
        rows.append({'path': name, 'mode': mode, 'oid': oid})
    require(0 < len(rows) <= 20000 and len({row['path'] for row in rows}) == len(rows), 'TREE_SIZE')
    return rows


def read_exact(source, size):
    chunks = []
    while size:
        chunk = source.read(min(size, 1024 * 1024))
        require(chunk, 'BLOB_SHORT_READ')
        chunks.append(chunk)
        size -= len(chunk)
    return b''.join(chunks)


def blobs(repo, entries):
    process = subprocess.Popen(['/usr/bin/git', '-C', str(repo), 'cat-file', '--batch'],
                               env=GIT_ENV, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL)
    total = 0
    try:
        for entry in entries:
            process.stdin.write((entry['oid'] + '\n').encode())
            process.stdin.flush()
            header = process.stdout.readline(128).decode().strip().split()
            require(len(header) == 3 and header[:2] == [entry['oid'], 'blob'], 'BLOB_HEADER')
            size = int(header[2])
            total += size
            require(0 <= size <= MAX_BLOB and total <= MAX_TOTAL, 'BLOB_SIZE_LIMIT')
            raw = read_exact(process.stdout, size)
            require(process.stdout.read(1) == b'\n', 'BLOB_DELIMITER')
            require(hashlib.sha1(b'blob ' + str(size).encode() + b'\0' + raw).hexdigest() == entry['oid'],
                    'BLOB_ID_MISMATCH')
            yield entry, raw
        process.stdin.close()
        require(process.wait(timeout=10) == 0, 'GIT_BATCH_FAILED')
    finally:
        if process.poll() is None:
            process.kill()
        for stream in (process.stdin, process.stdout):
            if stream is not None and not stream.closed:
                stream.close()
        process.wait(timeout=10)


def expanded(name, raw, nested=False):
    lower = name.lower()
    is_gzip = raw.startswith(b'\x1f\x8b')
    if nested:
        require(not is_gzip and not lower.endswith(('.gz', '.tgz')), 'NESTED_ARCHIVE_UNSUPPORTED')
    if not is_gzip and not lower.endswith(('.gz', '.tgz')):
        unsupported_magic = (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08', b'\xfd7zXZ\x00',
                             b'BZh', b'7z\xbc\xaf\x27\x1c', b'Rar!', b'\x28\xb5\x2f\xfd', b'\x04\x22\x4d\x18')
        require(not lower.endswith(('.zip', '.xz', '.bz2', '.zst', '.7z', '.rar', '.tar', '.tgz',
                                    '.br', '.lz4', '.lz', '.lzo', '.cab', '.z'))
                and not raw.startswith(unsupported_magic) and raw[257:262] != b'ustar',
                'UNSUPPORTED_ARCHIVE')
        return []
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
        decoded = stream.read(MAX_DECODED + 1)
    require(len(decoded) <= MAX_DECODED, 'EXPANDED_SIZE_LIMIT')
    if not lower.endswith(('.tar.gz', '.tgz')) and decoded[257:262] != b'ustar':
        decoded_name = name[:-3] if lower.endswith('.gz') else name + '.decoded'
        expanded(decoded_name, decoded, nested=True)
        return [(decoded_name, decoded)]
    # The complete tar bytes also cover PAX and owner metadata outside member bodies.
    result, total = [('[decoded-tar-container]', decoded)], 0
    with tarfile.open(fileobj=io.BytesIO(decoded), mode='r:') as archive:
        for member in archive:
            safe_relative(member.name.rstrip('/'))
            if member.isdir():
                continue
            require(member.isfile() and not member.issym() and not member.islnk(), 'NONREGULAR_ARCHIVE_ENTRY')
            total += member.size
            require(0 <= member.size <= MAX_DECODED and total <= MAX_DECODED and len(result) < 5000,
                    'EXPANDED_SIZE_LIMIT')
            value = archive.extractfile(member).read(MAX_DECODED + 1)
            require(len(value) == member.size, 'ARCHIVE_MEMBER_SIZE')
            expanded(member.name, value, nested=True)
            result.append((member.name, value))
    return result


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def reviewed_findings(path):
    raw = path.read_bytes()
    require(len(raw) <= 2_000_000, 'FINDING_REVIEW_SIZE')
    data = json.loads(raw)
    require(data.get('version') == 1 and isinstance(data.get('findings'), list), 'FINDING_REVIEW_FORMAT')
    result = {}
    for row in data['findings']:
        require(set(row) == {'path', 'sha256', 'reason', *FIELDS}, 'FINDING_REVIEW_FIELDS')
        require(row['reason'] in REASONS and re.fullmatch(r'[0-9a-f]{64}', row['sha256']), 'FINDING_REVIEW_FIELDS')
        safe_relative(row['path'])
        require(isinstance(row['RuleID'], str) and re.fullmatch(r'[a-z0-9-]{1,100}', row['RuleID']), 'FINDING_REVIEW_FIELDS')
        require(all(type(row[key]) is int and row[key] >= 0 for key in FIELDS[1:]), 'FINDING_REVIEW_FIELDS')
        key = tuple(row[key] for key in ('path', 'sha256', *FIELDS))
        require(key not in result, 'DUPLICATE_REVIEWED_FINDING')
        result[key] = row['reason']
    return result, sha(raw)


def scan(args):
    repo = args.repo.resolve()
    require(args.repo.is_absolute() and repo.is_dir(), 'REPOSITORY_PATH')
    require(re.fullmatch(r'[0-9a-f]{40}', args.commit) and re.fullmatch(r'[0-9a-f]{40}', args.release_commit),
            'COMMIT_FORMAT')
    require(re.fullmatch(r'refs/heads/[A-Za-z0-9._/-]+', args.release_ref) is not None, 'RELEASE_REF')
    state = repository_state(repo, args.release_ref)
    require(state['releaseCommit'] == args.release_commit, 'RELEASE_REF_CHANGED')
    parents = git(repo, 'rev-list', '--parents', '-n', '1', args.commit).decode().split()
    require(parents == [args.commit, args.release_commit], 'EVIDENCE_PARENT')
    app = configured_secrets(args.app_env_file, args.private_recovery_dir, repo)
    require(len(app) == args.expected_app_values, 'APP_SECRET_COUNT')
    hosting = hosting_secrets(args.gh_bin)
    patterns = secret_patterns(app | hosting)
    require(sha(args.gitleaks_bin.read_bytes()) == GITLEAKS_SHA, 'GITLEAKS_BINARY_HASH')
    config = derived_config(args.gitleaks_config.read_bytes())
    reviewed, review_hash = reviewed_findings(args.reviewed_findings)
    require(args.output_dir.is_absolute() and not args.output_dir.exists() and not args.output_dir.is_symlink(), 'OUTPUT_EXISTS')
    require(args.output_dir.resolve() != repo and repo not in args.output_dir.resolve().parents, 'OUTPUT_IN_REPOSITORY')
    args.output_dir.mkdir(mode=0o700, parents=False)
    out = args.output_dir
    source = out / 'scan-input'
    source.mkdir(mode=0o700)
    inventory, lookup, hits, decoded_count, decoded_bytes = [], {}, [], 0, 0
    try:
        entries = tree_entries(repo, args.commit)
        def save(relative, label, raw, oid=None, mode=None):
            require(not any(value in label.encode() for value in patterns), 'SECRET_IN_PATH')
            target = source / relative
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            target.write_bytes(raw)
            row = {'path': label, 'scanPath': relative, 'sha256': sha(raw), 'bytes': len(raw)}
            if oid:
                row.update({'oid': oid, 'mode': mode})
            inventory.append(row)
            lookup[relative] = row
            if any(value in raw for value in patterns):
                hits.append(label)
        for ordinal, (entry, raw) in enumerate(blobs(repo, entries)):
            save('raw/' + entry['path'], entry['path'], raw, entry['oid'], entry['mode'])
            for index, (member, value) in enumerate(expanded(entry['path'], raw)):
                decoded_count += 1
                decoded_bytes += len(value)
                require(decoded_bytes <= MAX_DECODED_TOTAL, 'EXPANDED_TOTAL_LIMIT')
                extension = PurePosixPath(member).suffix
                require(re.fullmatch(r'(?:\.[A-Za-z0-9_-]{1,20})?', extension) is not None, 'ARCHIVE_EXTENSION')
                save(f'decoded/{ordinal:05d}/{index:05d}{extension}', entry['path'] + '!/' + member, value)
        write_json(out / 'inventory.json', {'commit': args.commit, 'entries': inventory})
        config_path = out / 'gitleaks-all-paths.toml'
        config_path.write_bytes(config)
        ignore = out / 'empty-ignore'
        ignore.write_bytes(b'')
        report_path = out / 'gitleaks-redacted.json'
        with (out / 'gitleaks-private.log').open('wb') as log:
            result = subprocess.run([str(args.gitleaks_bin), 'dir', str(source), '--config', str(config_path),
                '--gitleaks-ignore-path', str(ignore), '--ignore-gitleaks-allow', '--redact=100',
                '--no-banner', '--no-color', '--report-format', 'json', '--report-path', str(report_path)],
                env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'HOME': str(out)}, stdin=subprocess.DEVNULL,
                stdout=log, stderr=subprocess.STDOUT, timeout=300)
        require(result.returncode in (0, 1), 'GITLEAKS_FAILED')
        require(report_path.is_file() and report_path.stat().st_size <= 20_000_000, 'GITLEAKS_REPORT_SIZE')
        findings = json.loads(report_path.read_bytes())
        require(isinstance(findings, list), 'GITLEAKS_REPORT_FORMAT')
        require((result.returncode == 0) == (len(findings) == 0), 'GITLEAKS_EXIT_REPORT_MISMATCH')
        metadata = []
        for finding in findings:
            relative = str(Path(finding['File']).relative_to(source))
            require(relative in lookup, 'GITLEAKS_REPORT_PATH')
            item = lookup[relative]
            row = {'path': item['path'], 'sha256': item['sha256'], **{key: finding[key] for key in FIELDS}}
            require(re.fullmatch(r'[a-z0-9-]{1,100}', row['RuleID']) and
                    all(type(row[key]) is int and row[key] >= 0 for key in FIELDS[1:]), 'GITLEAKS_REPORT_FIELDS')
            row['review'] = reviewed.get(tuple(row[key] for key in ('path', 'sha256', *FIELDS)), 'needs-review')
            metadata.append(row)
        unresolved = sum(row['review'] == 'needs-review' for row in metadata)
        write_json(out / 'findings-metadata.json', metadata)
        # Do not publish raw tool output if its redaction failed.
        redaction_ok = all(not any(value in file.read_bytes() for value in patterns)
                           for file in (report_path, out / 'gitleaks-private.log'))
        summary = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   'commit': args.commit, 'releaseCommit': args.release_commit,
                   'exactBlobFiles': len(entries), 'exactBlobBytes': sum(row['bytes'] for row in inventory if 'oid' in row),
                   'decodedPayloads': decoded_count, 'decodedBytes': decoded_bytes,
                   'configuredAppValuesChecked': len(app), 'hostingAndGitHubValuesChecked': len(hosting),
                   'knownValueMatchedPaths': hits, 'gitleaksFindings': len(metadata),
                   'unreviewedFindings': unresolved, 'gitleaksRedactionPassed': redaction_ok,
                   'gitleaksBinarySha256': GITLEAKS_SHA, 'upstreamConfigSha256': CONFIG_SHA,
                   'allPathsConfigSha256': sha(config), 'reviewedFindingsSha256': review_hash,
                   'globalPathExclusionsRemoved': True, 'gitExportAttributesApplied': False,
                   'mainAndIndexUnchanged': repository_state(repo, args.release_ref) == state,
                   'passed': not hits and unresolved == 0 and redaction_ok}
        summary['passed'] = summary['passed'] and summary['mainAndIndexUnchanged']
        write_json(out / 'summary.json', summary)
        return summary
    finally:
        require(repository_state(repo, args.release_ref) == state, 'REPOSITORY_STATE_CHANGED')


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path('/home/kulmisiu/dev/dota2-trivia'))
    parser.add_argument('--commit', required=True)
    parser.add_argument('--release-commit', required=True)
    parser.add_argument('--release-ref', default='refs/heads/codex/launch-checks-20261006')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--private-recovery-dir', type=Path, default=Path('/home/kulmisiu/dev/dota2-trivia/.local-assets/operator-recovery-20261010/render-productionize-private'))
    parser.add_argument('--app-env-file', type=Path, default=Path('/home/kulmisiu/dev/dota2-trivia/.env.local'))
    parser.add_argument('--expected-app-values', type=int, default=7)
    parser.add_argument('--gh-bin', type=Path, default=Path('/home/kulmisiu/.local/bin/gh'))
    parser.add_argument('--gitleaks-bin', type=Path, default=Path('/home/kulmisiu/.cache/gitleaks/queue-arcade-audit/gitleaks'))
    parser.add_argument('--gitleaks-config', type=Path, default=Path('/home/kulmisiu/.cache/gitleaks/queue-arcade-audit/gitleaks.toml'))
    parser.add_argument('--reviewed-findings', type=Path, default=Path('/tmp/dota2-trivia-audit-close/reviewed-findings-baseline.json'))
    return parser.parse_args()


def main():
    os.umask(0o077)
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(ScanError('SCAN_DEADLINE')))
    signal.alarm(600)
    try:
        summary = scan(arguments())
        print(json.dumps(summary))
        return 0 if summary['passed'] else 2
    except Exception as error:
        code = str(error) if isinstance(error, ScanError) and re.fullmatch(r'[A-Z][A-Z0-9_]{1,80}', str(error)) else 'SCAN_FAILED'
        print(json.dumps({'passed': False, 'failure': code}))
        return 2
    finally:
        signal.alarm(0)


if __name__ == '__main__':
    sys.exit(main())
