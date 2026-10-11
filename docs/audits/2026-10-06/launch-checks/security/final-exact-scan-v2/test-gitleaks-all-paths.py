#!/usr/bin/env python3
"""Check the pinned scanner with two synthetic files. No repository scan."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--helper', type=Path, default=Path(__file__).with_name('final-exact-scan.py'))
parser.add_argument('--gitleaks-bin', type=Path, required=True)
parser.add_argument('--gitleaks-config', type=Path, required=True)
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('scanner', args.helper)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)
assert scanner.sha(args.gitleaks_bin.read_bytes()) == scanner.GITLEAKS_SHA
config = args.gitleaks_config.read_bytes()
derived = scanner.derived_config(config)
os.umask(0o077)
with tempfile.TemporaryDirectory(prefix='gitleaks-synthetic-paths-') as folder:
    root = Path(folder)
    source = root / 'source'
    source.mkdir()
    value = 'ghp_' + hashlib.sha256(b'queue-arcade synthetic fixture only').hexdigest()[:36]
    (source / 'icon.svg').write_text('<svg><!-- token=' + value + ' --></svg>\n')
    (source / 'pnpm-lock.yaml').write_text('synthetic: ' + value + '\n')
    rows = []
    for label, raw, expected in [('upstream', config, set()),
                                  ('all-paths', derived, {'icon.svg', 'pnpm-lock.yaml'})]:
        config_path = root / (label + '.toml')
        config_path.write_bytes(raw)
        report_path = root / (label + '.json')
        ignored = root / 'empty-ignore'
        ignored.write_bytes(b'')
        run = subprocess.run([str(args.gitleaks_bin), 'dir', str(source), '--config', str(config_path),
            '--gitleaks-ignore-path', str(ignored), '--ignore-gitleaks-allow', '--redact=100',
            '--no-banner', '--no-color', '--report-format', 'json', '--report-path', str(report_path)],
            env={'PATH': '/usr/bin:/bin', 'LANG': 'C', 'HOME': str(root)},
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        assert run.returncode in (0, 1)
        report = json.loads(report_path.read_bytes())
        assert (run.returncode == 0) == (not report)
        assert {Path(row['File']).name for row in report} == expected
        assert all(row['RuleID'] == 'github-pat' for row in report)
        assert value.encode() not in report_path.read_bytes()
        assert value.encode() not in run.stdout + run.stderr
        rows.append({'configuration': label, 'findingCount': len(report),
                     'filesDetected': sorted(expected), 'redactionPassed': True})
    print(json.dumps({'passed': True, 'scope': 'Two synthetic files only; no target scan or real credentials.',
                      'gitleaksBinarySha256': scanner.GITLEAKS_SHA,
                      'upstreamConfigSha256': scanner.CONFIG_SHA,
                      'allPathsConfigSha256': scanner.sha(derived), 'cases': rows}, indent=2))
