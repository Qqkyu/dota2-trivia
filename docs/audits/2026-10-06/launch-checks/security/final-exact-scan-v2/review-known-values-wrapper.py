#!/usr/bin/env python3
"""Isolated wrapper tests. No real credential reads, network, or target Git access."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock

BASE = Path(__file__).parent

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result

wrapper = load(BASE / 'scan-candidate-known-values.py', 'review_known_wrapper')
helper = load(BASE / 'final-exact-scan.py', 'review_known_helpers')
COMMIT = 'a' * 40
APP = {('isolated-app-value-%02d-123456' % i).encode() for i in range(7)}
OPERATOR = {b'isolated-operator-one-123456', b'isolated-operator-two-123456'}


class WrapperReview(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='known-wrapper-review-', dir='/tmp')
        self.base = Path(self.temp.name)
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        self.output = self.base / 'result.json'
        self.old_umask = os.umask(0o077)

    def tearDown(self):
        os.umask(self.old_umask)
        self.temp.cleanup()

    def invoke(self, helper_path=None, scanner=None):
        argv = ['scan-candidate-known-values.py', '--commit', COMMIT, '--output', str(self.output),
                '--repo', str(self.repo), '--helper', str(helper_path or (self.base/'unused-helper.py'))]
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.ExitStack() as stack:
            stack.enter_context(mock.patch.object(wrapper.sys, 'argv', argv))
            stack.enter_context(contextlib.redirect_stdout(stdout))
            stack.enter_context(contextlib.redirect_stderr(stderr))
            if scanner is not None:
                spec = types.SimpleNamespace(loader=types.SimpleNamespace(exec_module=lambda _:None))
                stack.enter_context(mock.patch.object(wrapper.importlib.util, 'spec_from_file_location', return_value=spec))
                stack.enter_context(mock.patch.object(wrapper.importlib.util, 'module_from_spec', return_value=scanner))
            result = wrapper.main()
        self.assertEqual(stderr.getvalue(), '')
        for value in APP | OPERATOR:
            self.assertNotIn(value.decode(), stdout.getvalue())
        return result, json.loads(stdout.getvalue())

    def scanner(self, content=b'safe data', path='src/fixture.txt', app=None, operator=None,
                race=None, changed_state=False):
        entry = {'path': path, 'mode':'100644', 'oid':'b'*40}
        state = {'head':'c'*40,'indexSha256':'d'*64,'releaseRef':'refs/heads/review','releaseCommit':'e'*40}
        def blobs(repo, entries):
            self.assertEqual(repo, self.repo)
            self.assertEqual(entries, [entry])
            if race:
                race()
            yield entry, content
        states = [state, dict(state, head='f'*40)] if changed_state else [state,state]
        return types.SimpleNamespace(ScanError=helper.ScanError, require=helper.require,
            repository_state=mock.Mock(side_effect=states),
            configured_secrets=mock.Mock(return_value=APP if app is None else app),
            hosting_secrets=mock.Mock(return_value=OPERATOR if operator is None else operator),
            secret_patterns=helper.secret_patterns,
            tree_entries=mock.Mock(return_value=[entry]), blobs=blobs)

    def test_clean_values_create_private_report(self):
        status, result = self.invoke(scanner=self.scanner())
        self.assertEqual(status,0)
        self.assertTrue(result['passed'])
        self.assertEqual(result['appCredentialValuesChecked'],7)
        self.assertEqual(result['operatorCredentialValuesChecked'],2)
        self.assertTrue(result['steamWebApiKeyRequiredAndChecked'])
        self.assertEqual(self.output.stat().st_mode & 0o777,0o600)
        self.assertEqual(json.loads(self.output.read_text()),result)

    def test_known_value_hit_fails_without_value_output(self):
        status, result = self.invoke(scanner=self.scanner(content=next(iter(APP))))
        self.assertEqual(status,2)
        self.assertFalse(result['passed'])
        self.assertEqual(result['matchedFiles'],['src/fixture.txt'])

    def test_secret_in_path_is_not_printed(self):
        status, result = self.invoke(scanner=self.scanner(path=next(iter(APP)).decode()))
        self.assertEqual((status,result['failure']),(2,'SECRET_IN_PATH'))
        self.assertFalse(self.output.exists())

    def test_app_value_count_mismatch_fails(self):
        scanner=self.scanner(app=set(list(APP)[:6]))
        status, result = self.invoke(scanner=scanner)
        self.assertEqual((status,result['failure']),(2,'CREDENTIAL_COUNT'))
        scanner.tree_entries.assert_not_called()

    def test_operator_value_count_mismatch_fails(self):
        status, result = self.invoke(scanner=self.scanner(operator={next(iter(OPERATOR))}))
        self.assertEqual((status,result['failure']),(2,'CREDENTIAL_COUNT'))

    def test_changed_git_state_fails_before_report(self):
        status, result = self.invoke(scanner=self.scanner(changed_state=True))
        self.assertEqual((status,result['failure']),(2,'GIT_STATE_CHANGED'))
        self.assertFalse(self.output.exists())

    def test_missing_helper_has_fixed_error(self):
        status, result = self.invoke(helper_path=self.base/'missing.py')
        self.assertEqual((status,result['failure']),(2,'KNOWN_VALUE_CHECK_FAILED'))
        self.assertFalse(self.output.exists())

    def test_invalid_helper_has_fixed_error(self):
        path = self.base/'invalid.py'
        path.write_text('def invalid python :\n')
        status, result = self.invoke(helper_path=path)
        self.assertEqual((status,result['failure']),(2,'KNOWN_VALUE_CHECK_FAILED'))

    def test_import_error_message_is_hidden(self):
        path=self.base/'bad_import.py'
        path.write_text('raise ValueError("isolated-sensitive-error-marker")\n')
        status,result=self.invoke(helper_path=path)
        self.assertEqual((status,result['failure']),(2,'KNOWN_VALUE_CHECK_FAILED'))
        self.assertNotIn('isolated-sensitive-error-marker',json.dumps(result))

    def test_raced_file_is_preserved(self):
        prior=b'existing operator note'
        status,result=self.invoke(scanner=self.scanner(race=lambda:self.output.write_bytes(prior)))
        self.assertEqual((status,result['failure']),(2,'KNOWN_VALUE_CHECK_FAILED'))
        self.assertEqual(self.output.read_bytes(),prior)

    def test_raced_symlink_target_is_preserved(self):
        victim=self.base/'victim'
        victim.write_bytes(b'existing operator note')
        status,result=self.invoke(scanner=self.scanner(race=lambda:self.output.symlink_to(victim)))
        self.assertEqual((status,result['failure']),(2,'KNOWN_VALUE_CHECK_FAILED'))
        self.assertEqual(victim.read_bytes(),b'existing operator note')
        self.assertTrue(self.output.is_symlink())

    def test_output_inside_repo_is_rejected_before_credentials(self):
        self.output=self.repo/'result.json'
        scanner=self.scanner()
        status,result=self.invoke(scanner=scanner)
        self.assertEqual((status,result['failure']),(2,'OUTPUT_IN_REPOSITORY'))
        scanner.configured_secrets.assert_not_called()

    def test_preexisting_output_is_preserved(self):
        self.output.write_bytes(b'existing operator note')
        scanner=self.scanner()
        status,result=self.invoke(scanner=scanner)
        self.assertEqual((status,result['failure']),(2,'OUTPUT_EXISTS'))
        scanner.configured_secrets.assert_not_called()
        self.assertEqual(self.output.read_bytes(),b'existing operator note')

    def test_secret_loader_error_details_are_hidden(self):
        scanner=self.scanner()
        scanner.configured_secrets.side_effect=ValueError(next(iter(APP)).decode())
        status,result=self.invoke(scanner=scanner)
        self.assertEqual((status,result['failure']),(2,'KNOWN_VALUE_CHECK_FAILED'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
