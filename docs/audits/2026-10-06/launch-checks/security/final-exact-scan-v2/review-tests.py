#!/usr/bin/env python3
"""Independent isolated tests. No real credentials, target scan or network access."""
import contextlib
import copy
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import types
import unittest
from unittest import mock

HELPER = Path(__file__).with_name('final-exact-scan.py')
spec = importlib.util.spec_from_file_location('final_scan_review_target', HELPER)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
A = 'a' * 40
B = 'b' * 40
SYNTHETIC = b'isolated-test-credential-value-12345678'


def make_tar(entries):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as out:
        for name, value, kind in entries:
            row = tarfile.TarInfo(name)
            row.type = kind
            row.size = len(value) if kind == tarfile.REGTYPE else 0
            if kind == tarfile.SYMTYPE:
                row.linkname = '/outside'
            out.addfile(row, io.BytesIO(value) if row.size else None)
    return gzip.compress(stream.getvalue())


class IndependentReview(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='final-scan-review-', dir='/tmp')
        self.root = Path(self.tmp.name)
        self.old_umask = os.umask(0o077)

    def tearDown(self):
        os.umask(self.old_umask)
        self.tmp.cleanup()

    def fails(self, code, fn, *args):
        with self.assertRaises(m.ScanError) as caught:
            fn(*args)
        self.assertEqual(str(caught.exception), code)

    def test_paths_and_forbidden_files(self):
        for value in ('../outside', '/absolute', 'a/../b', 'a//b', 'a\\b', 'x\ny', 'x\0y', ''):
            with self.subTest(value=repr(value)):
                self.fails('UNSAFE_PATH', m.safe_relative, value)
        for value in ('.env', '.env.production', 'x/.env.example', '.data/accounts.json',
                      '.local-assets/foo', 'x/operator-recovery-2026/data.json', 'x/private-render-backup/a',
                      'x/database.dump', 'x/foo.pem', 'x/.next-prod/a'):
            with self.subTest(value=value):
                self.assertTrue(m.forbidden_path(value))
        self.assertFalse(m.forbidden_path('.env.example'))
        self.assertFalse(m.forbidden_path('docs/report.json'))

    def test_tree_rejects_symlink_submodule_and_bad_sha(self):
        self.fails('COMMIT_FORMAT', m.tree_entries, self.root, 'HEAD')
        for mode, kind in (('120000', 'blob'), ('160000', 'commit')):
            with self.subTest(mode=mode):
                def fake_git(repo, *args, **kwargs):
                    return A.encode() if args[0] == 'rev-parse' else f'{mode} {kind} {B}\tentry\0'.encode()
                with mock.patch.object(m, 'git', fake_git):
                    self.fails('NONREGULAR_GIT_ENTRY', m.tree_entries, self.root, A)

    def test_exact_blobs_ignore_export_attributes(self):
        env = dict(m.GIT_ENV, GIT_AUTHOR_NAME='Review', GIT_AUTHOR_EMAIL='review@example.invalid',
                   GIT_COMMITTER_NAME='Review', GIT_COMMITTER_EMAIL='review@example.invalid')
        def git(*args, raw=None):
            result = subprocess.run(['/usr/bin/git', '-C', str(self.root), *args], input=raw,
                                    env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            return result.stdout
        git('init', '--quiet')
        fixtures = {'.gitattributes': b'hidden.txt export-ignore\nsubstituted.txt export-subst\n',
                    'hidden.txt': b'this blob must still be scanned\n',
                    'substituted.txt': b'$Format:%H$\n'}
        tree = b''
        for name, raw in sorted(fixtures.items()):
            oid = git('hash-object', '-w', '--stdin', raw=raw).strip()
            tree += b'100644 blob ' + oid + b'\t' + name.encode() + b'\n'
        tree_id = git('mktree', raw=tree).strip().decode()
        commit = git('commit-tree', tree_id, raw=b'isolated review fixture\n').strip().decode()
        entries = m.tree_entries(self.root, commit)
        actual = {entry['path']: raw for entry, raw in m.blobs(self.root, entries)}
        self.assertEqual(actual, fixtures)
        self.assertEqual(m.GIT_ENV['GIT_NO_REPLACE_OBJECTS'], '1')
        self.assertFalse((self.root / '.git/index').exists())

    def test_private_permissions_and_symlink(self):
        path = self.root / 'private.json'
        path.write_text('{}')
        path.chmod(0o644)
        self.fails('PRIVATE_INPUT_PERMISSIONS', m.private_file, path)
        self.assertEqual(m.private_file(path, original_env=True), b'{}')
        path.chmod(0o666)
        with self.assertRaises(m.ScanError):
            m.private_file(path, original_env=True)
        path.chmod(0o600)
        link = self.root / 'link'
        link.symlink_to(path)
        self.fails('PRIVATE_INPUT_TYPE', m.private_file, link)

    def app_fixtures(self, original=False):
        recovery = self.root / 'recovery'
        recovery.mkdir(mode=0o700)
        for name in ('runtime-verified.json', 'environment-before.json'):
            (recovery / name).write_text('{}')
        password = 'synthetic:password%123456'
        url = 'postgresql://user:' + m.urllib.parse.quote(password, safe='') + '@localhost/db'
        app = self.root / ('.env.local' if original else 'custom.env')
        app.write_text('ARCADE_AUTH_SECRET=synthetic-auth-value-123456\n'
                       'ARCADE_VOTER_SALT=synthetic-salt-value-123456\n'
                       'STEAM_WEB_API_KEY=synthetic-steam-value-123456\nDATABASE_URL=' + url + '\n')
        return app, recovery, password, url

    def test_app_values_and_encoded_password(self):
        app, recovery, password, url = self.app_fixtures()
        values = m.configured_secrets(app, recovery, self.root)
        self.assertIn(password.encode(), values)
        self.assertIn(url.encode(), values)
        patterns = m.secret_patterns(values)
        self.assertIn(m.urllib.parse.quote(password, safe='').encode(), patterns)
        self.assertEqual(len(values), 5)

    def test_canonical_steam_web_api_key_is_scanned(self):
        app, recovery, _, _ = self.app_fixtures()
        values = m.configured_secrets(app, recovery, self.root)
        self.assertIn(b'synthetic-steam-value-123456', values)
        self.assertIn(b'synthetic-steam-value-123456', m.secret_patterns(values))

    def test_legacy_alias_absence_does_not_block(self):
        app, recovery, password, url = self.app_fixtures()
        self.assertNotIn('STEAM_API_KEY=', app.read_text())
        values = m.configured_secrets(app, recovery, self.root)
        self.assertEqual(values, {b'synthetic-auth-value-123456',
                                  b'synthetic-salt-value-123456',
                                  b'synthetic-steam-value-123456',
                                  password.encode(), url.encode()})

    def test_present_legacy_alias_is_also_scanned(self):
        app, recovery, _, _ = self.app_fixtures()
        app.write_text(app.read_text() + 'STEAM_API_KEY=synthetic-legacy-steam-value-123456\n')
        values = m.configured_secrets(app, recovery, self.root)
        self.assertIn(b'synthetic-steam-value-123456', values)
        self.assertIn(b'synthetic-legacy-steam-value-123456', values)
        self.assertIn(b'synthetic-legacy-steam-value-123456', m.secret_patterns(values))
        self.assertEqual(len(values), 6)

    def test_legacy_alias_cannot_replace_canonical_key(self):
        app, recovery, _, _ = self.app_fixtures()
        app.write_text(app.read_text().replace('STEAM_WEB_API_KEY=', 'STEAM_API_KEY='))
        self.fails('APP_SECRET_KEYS_MISSING', m.configured_secrets,
                   app, recovery, self.root)

    def test_missing_each_required_key_is_rejected(self):
        app, recovery, _, _ = self.app_fixtures()
        original = app.read_text()
        for key in ('ARCADE_AUTH_SECRET', 'ARCADE_VOTER_SALT', 'DATABASE_URL', 'STEAM_WEB_API_KEY'):
            with self.subTest(key=key):
                app.write_text('\n'.join(line for line in original.splitlines()
                                         if not line.startswith(key + '=')))
                self.fails('APP_SECRET_KEYS_MISSING', m.configured_secrets,
                           app, recovery, self.root)

    def test_default_expected_app_value_count_is_seven(self):
        argv = ['final-exact-scan.py', '--commit', A, '--release-commit', B,
                '--output-dir', str(self.root / 'unused-output')]
        with mock.patch.object(m.sys, 'argv', argv):
            self.assertEqual(m.arguments().expected_app_values, 7)

    def test_wrong_owner_recovery_directory_is_rejected(self):
        app, recovery, _, _ = self.app_fixtures()
        real_lstat = Path.lstat
        def mocked_lstat(path):
            result = real_lstat(path)
            if path == recovery:
                fields = list(result)
                fields[4] = os.getuid() + 1
                return os.stat_result(fields)
            return result
        with mock.patch.object(Path, 'lstat', new=mocked_lstat):
            self.fails('RECOVERY_DIRECTORY_PERMISSIONS', m.configured_secrets,
                       app, recovery, self.root)

    def test_original_environment_exception_is_exact(self):
        app, recovery, _, _ = self.app_fixtures(original=True)
        original = app.read_bytes()
        app.chmod(0o644)
        m.configured_secrets(app, recovery, self.root)
        self.assertEqual(app.read_bytes(), original)
        other = self.root / 'custom.env'
        other.write_bytes(original)
        other.chmod(0o644)
        self.fails('PRIVATE_INPUT_PERMISSIONS', m.configured_secrets, other, recovery, self.root)

    def test_missing_empty_short_and_malformed_app_values(self):
        app, recovery, _, _ = self.app_fixtures()
        original = app.read_text()
        cases = [('ARCADE_AUTH_SECRET=', 'APP_SECRET_VALUE'),
                 ('ARCADE_AUTH_SECRET=short', 'APP_SECRET_TOO_SHORT'),
                 ('DATABASE_URL=https://example.invalid/path', 'DATABASE_SECRET_VALUE')]
        for line, code in cases:
            with self.subTest(code=code):
                key = line.split('=', 1)[0]
                app.write_text('\n'.join(line if x.startswith(key + '=') else x for x in original.splitlines()))
                self.fails(code, m.configured_secrets, app, recovery, self.root)
        app.write_text('\n'.join(x for x in original.splitlines() if not x.startswith('ARCADE_AUTH_SECRET=')))
        self.fails('APP_SECRET_KEYS_MISSING', m.configured_secrets, app, recovery, self.root)

    def test_hosting_capture_keeps_render_out_of_child(self):
        token = b'isolated-github-value-123456'
        rendered = 'isolated-render-value-123456'
        def command(argv, *, env, timeout, limit):
            self.assertEqual(argv[-3:], ['token', '--hostname', 'github.com'])
            self.assertNotIn('RENDER_API_KEY', env)
            self.assertNotIn('UNRELATED_SECRET', env)
            self.assertNotIn(rendered, ' '.join(argv))
            return token + b'\n'
        with mock.patch.dict(os.environ, {'RENDER_API_KEY': rendered, 'UNRELATED_SECRET': 'sensitive'}, clear=True), \
             mock.patch.object(m, 'run', command):
            self.assertEqual(m.hosting_secrets(Path('/synthetic/gh')), {token, rendered.encode()})

    def test_hosting_missing_and_command_failure_are_fixed(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.fails('RENDER_SECRET_MISSING', m.hosting_secrets, Path('/synthetic/gh'))
        for result in (subprocess.CompletedProcess([], 1, b'', SYNTHETIC),
                       subprocess.CompletedProcess([], 0, SYNTHETIC, b'warning')):
            with mock.patch.object(m.subprocess, 'run', return_value=result):
                self.fails('COMMAND_FAILED', lambda: m.run(['/synthetic/gh'], env={}))
        with mock.patch.object(m.subprocess, 'run', side_effect=subprocess.TimeoutExpired(['synthetic'], 1, output=SYNTHETIC)):
            self.fails('COMMAND_FAILED', lambda: m.run(['synthetic'], env={}))

    def test_config_changes_only_global_paths(self):
        raw = b'title = "fixture"\n[allowlist]\npaths = [\n "one",\n "two",\n]\nregexes = ["unchanged"]\n[[rules]]\nid="test"\nregex="token"\n'
        with mock.patch.object(m, 'CONFIG_SHA', m.sha(raw)):
            result = m.derived_config(raw)
        expected = m.tomllib.loads(raw.decode())
        expected['allowlist']['paths'] = []
        self.assertEqual(m.tomllib.loads(result.decode()), expected)
        self.fails('GITLEAKS_CONFIG_HASH', m.derived_config, raw)

    def test_gzip_and_tar_payload_coverage(self):
        self.assertEqual(m.expanded('x.log.gz', gzip.compress(SYNTHETIC)), [('x.log', SYNTHETIC)])
        raw = make_tar([('one.json', SYNTHETIC, tarfile.REGTYPE), ('two.txt', b'other', tarfile.REGTYPE)])
        expanded = m.expanded('x.tar.gz', raw)
        self.assertEqual(expanded[0], ('[decoded-tar-container]', gzip.decompress(raw)))
        self.assertEqual(expanded[1:], [('one.json', SYNTHETIC), ('two.txt', b'other')])

    def test_archive_bounds_paths_links_and_nesting(self):
        with mock.patch.object(m, 'MAX_DECODED', 64):
            self.fails('EXPANDED_SIZE_LIMIT', m.expanded, 'bomb.gz', gzip.compress(b'x' * 65))
        cases = [('../outside', b'x', tarfile.REGTYPE, 'UNSAFE_PATH'),
                 ('link', b'', tarfile.SYMTYPE, 'NONREGULAR_ARCHIVE_ENTRY'),
                 ('nested.gz', b'x', tarfile.REGTYPE, 'NESTED_ARCHIVE_UNSUPPORTED')]
        for name, raw, kind, code in cases:
            with self.subTest(name=name):
                self.fails(code, m.expanded, 'x.tar.gz', make_tar([(name, raw, kind)]))
        self.fails('UNSUPPORTED_ARCHIVE', m.expanded, 'x.zip', b'anything')

    def scan_fixture(self, raw=b'ordinary content', findings=(), reviewed=None, log=b'', path='src/fixture.txt', tool_status=None):
        repo = self.root / 'repo'
        repo.mkdir()
        binary = self.root / 'gitleaks'
        binary.write_bytes(b'isolated binary marker')
        config = self.root / 'config.toml'
        config.write_bytes(b'isolated config marker')
        args = types.SimpleNamespace(repo=repo, commit=A, release_commit=B,
             release_ref='refs/heads/test', app_env_file=self.root/'unused-env',
             private_recovery_dir=self.root/'unused-recovery', expected_app_values=1,
             gh_bin=self.root/'unused-gh', gitleaks_bin=binary, gitleaks_config=config,
             reviewed_findings=self.root/'unused-review', output_dir=self.root/'result')
        entry = {'path':path,'mode':'100644','oid':'c'*40}
        state = {'head':'d'*40,'indexSha256':'e'*64,'releaseRef':args.release_ref,'releaseCommit':B}
        def scanner(argv, **kwargs):
            self.assertNotIn('RENDER_API_KEY', kwargs['env'])
            self.assertNotIn('GH_TOKEN', kwargs['env'])
            target = Path(argv[argv.index('--report-path') + 1])
            data = []
            for finding in findings:
                data.append(dict(finding, File=str(args.output_dir/'scan-input/raw/src/fixture.txt')))
            target.write_text(json.dumps(data))
            kwargs['stdout'].write(log)
            return subprocess.CompletedProcess(argv, int(bool(findings)) if tool_status is None else tool_status)
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(m, 'repository_state', return_value=state))
            stack.enter_context(mock.patch.object(m, 'git', return_value=f'{A} {B}\n'.encode()))
            stack.enter_context(mock.patch.object(m, 'configured_secrets', return_value={SYNTHETIC}))
            stack.enter_context(mock.patch.object(m, 'hosting_secrets', return_value={b'fake-hosting-value-one',b'fake-hosting-value-two'}))
            stack.enter_context(mock.patch.object(m, 'GITLEAKS_SHA', m.sha(binary.read_bytes())))
            stack.enter_context(mock.patch.object(m, 'derived_config', return_value=b'title="fixture"'))
            stack.enter_context(mock.patch.object(m, 'reviewed_findings', return_value=(reviewed or {}, 'f'*64)))
            stack.enter_context(mock.patch.object(m, 'tree_entries', return_value=[entry]))
            stack.enter_context(mock.patch.object(m, 'blobs', return_value=iter([(entry,raw)])))
            stack.enter_context(mock.patch.object(m.subprocess, 'run', side_effect=scanner))
            result = m.scan(args)
        self.assertEqual((args.output_dir.stat().st_mode & 0o777), 0o700)
        self.assertNotIn(SYNTHETIC, json.dumps(result).encode())
        self.assertNotIn(SYNTHETIC, (args.output_dir/'summary.json').read_bytes())
        return result

    def test_known_value_hit_fails_without_value_in_summary(self):
        result = self.scan_fixture(raw=b'prefix ' + SYNTHETIC)
        self.assertFalse(result['passed'])
        self.assertEqual(result['knownValueMatchedPaths'], ['src/fixture.txt'])

    def test_unknown_gitleaks_finding_fails(self):
        row = {'RuleID':'synthetic-test','StartLine':1,'EndLine':1,'StartColumn':1,'EndColumn':3}
        result = self.scan_fixture(findings=[row])
        self.assertFalse(result['passed'])
        self.assertEqual(result['unreviewedFindings'],1)

    def test_exact_review_match_passes(self):
        row = {'RuleID':'synthetic-test','StartLine':1,'EndLine':1,'StartColumn':1,'EndColumn':3}
        key = ('src/fixture.txt', m.sha(b'ordinary content'), *[row[x] for x in m.FIELDS])
        result = self.scan_fixture(findings=[row], reviewed={key:'synthetic-test-value'})
        self.assertTrue(result['passed'])

    def test_changed_blob_does_not_reuse_review(self):
        row = {'RuleID':'synthetic-test','StartLine':1,'EndLine':1,'StartColumn':1,'EndColumn':3}
        key = ('src/fixture.txt', m.sha(b'previous content'), *[row[x] for x in m.FIELDS])
        result = self.scan_fixture(findings=[row], reviewed={key:'synthetic-test-value'})
        self.assertFalse(result['passed'])

    def test_failed_redaction_is_not_a_pass(self):
        result = self.scan_fixture(log=SYNTHETIC)
        self.assertFalse(result['passed'])
        self.assertFalse(result['gitleaksRedactionPassed'])

    def test_tar_metadata_known_value_is_scanned(self):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w', format=tarfile.PAX_FORMAT) as archive:
            member = tarfile.TarInfo('safe.txt')
            member.size = 4
            member.pax_headers = {'comment': SYNTHETIC.decode()}
            archive.addfile(member, io.BytesIO(b'safe'))
        result = self.scan_fixture(raw=gzip.compress(buffer.getvalue()), path='docs/source.tar.gz')
        self.assertFalse(result['passed'])
        self.assertTrue(result['knownValueMatchedPaths'])

    def test_inconsistent_gitleaks_status_is_rejected(self):
        with self.assertRaises(m.ScanError):
            self.scan_fixture(tool_status=1)

    def test_operational_gitleaks_failure_is_rejected(self):
        with self.assertRaises(m.ScanError) as caught:
            self.scan_fixture(tool_status=2)
        self.assertEqual(str(caught.exception), 'GITLEAKS_FAILED')

    def test_main_hides_arbitrary_error_details(self):
        output = io.StringIO()
        with mock.patch.object(m, 'arguments', return_value=object()), \
             mock.patch.object(m, 'scan', side_effect=ValueError(SYNTHETIC.decode())), \
             contextlib.redirect_stdout(output):
            self.assertEqual(m.main(), 2)
        self.assertEqual(json.loads(output.getvalue()), {'passed':False,'failure':'SCAN_FAILED'})
        self.assertNotIn(SYNTHETIC.decode(), output.getvalue())


if __name__ == '__main__':
    unittest.main(verbosity=2)
