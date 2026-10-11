#!/usr/bin/env python3
"""Check configured credential values in one exact source commit. No Git writes."""
import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--helper', type=Path, default=Path(__file__).with_name('final-exact-scan.py'))
    parser.add_argument('--repo', type=Path, default=Path('/home/kulmisiu/dev/dota2-trivia'))
    parser.add_argument('--release-ref', default='refs/heads/codex/launch-checks-20261006')
    parser.add_argument('--app-env-file', type=Path, default=Path('/home/kulmisiu/dev/dota2-trivia/.env.local'))
    parser.add_argument('--private-recovery-dir', type=Path, default=Path('/home/kulmisiu/dev/dota2-trivia/.local-assets/operator-recovery-20261010/render-productionize-private'))
    parser.add_argument('--gh-bin', type=Path, default=Path('/home/kulmisiu/.local/bin/gh'))
    args = parser.parse_args()
    os.umask(0o077)
    scanner = None
    state = None
    try:
        spec = importlib.util.spec_from_file_location('final_scan_helpers', args.helper)
        scanner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(scanner)
        signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(scanner.ScanError('SCAN_DEADLINE')))
        signal.alarm(120)
        repo = args.repo.resolve()
        scanner.require(args.repo.is_absolute() and repo.is_dir(), 'REPOSITORY_PATH')
        scanner.require(re.fullmatch(r'[0-9a-f]{40}', args.commit), 'COMMIT_FORMAT')
        scanner.require(args.output.is_absolute() and not args.output.exists() and not args.output.is_symlink(), 'OUTPUT_EXISTS')
        scanner.require(repo not in args.output.resolve().parents, 'OUTPUT_IN_REPOSITORY')
        state = scanner.repository_state(repo, args.release_ref)
        app = scanner.configured_secrets(args.app_env_file, args.private_recovery_dir, repo)
        operator = scanner.hosting_secrets(args.gh_bin)
        scanner.require(len(app) == 7 and len(operator) == 2, 'CREDENTIAL_COUNT')
        patterns = scanner.secret_patterns(app | operator)
        entries = scanner.tree_entries(repo, args.commit)
        hits, total = [], 0
        for entry, raw in scanner.blobs(repo, entries):
            scanner.require(not any(value in entry['path'].encode() for value in patterns), 'SECRET_IN_PATH')
            total += len(raw)
            if any(value in raw for value in patterns):
                hits.append(entry['path'])
        scanner.require(scanner.repository_state(repo, args.release_ref) == state, 'GIT_STATE_CHANGED')
        result = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'commit': args.commit, 'exactRawBlobFilesChecked': len(entries),
                  'exactRawBlobBytesChecked': total, 'appCredentialValuesChecked': len(app),
                  'operatorCredentialValuesChecked': len(operator),
                  'steamWebApiKeyRequiredAndChecked': True,
                  'rawUrlQuotedAndJsonEscapedFormsChecked': True,
                  'matchedFiles': hits, 'mainIndexAndReleaseRefUnchanged': True,
                  'scope': 'Known configured values in exact raw Git blobs. Gitleaks and the expanded-payload final evidence scan are separate checks.',
                  'passed': not hits}
        with args.output.open('x') as report:
            report.write(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result))
        return 0 if result['passed'] else 2
    except Exception as error:
        code = str(error) if scanner is not None and hasattr(scanner, 'ScanError') and isinstance(error, scanner.ScanError) and re.fullmatch(r'[A-Z][A-Z0-9_]{1,80}', str(error)) else 'KNOWN_VALUE_CHECK_FAILED'
        print(json.dumps({'passed': False, 'failure': code}))
        return 2
    finally:
        signal.alarm(0)


if __name__ == '__main__':
    sys.exit(main())
