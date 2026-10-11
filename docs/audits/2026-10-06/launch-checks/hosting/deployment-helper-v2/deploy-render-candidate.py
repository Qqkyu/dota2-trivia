import datetime
import json
import os
import re
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

SID = 'srv-d9mqd1942hec73e9nlt0'
BASE = 'https://api.render.com/v1/services/' + SID
OUT = Path('/tmp/queue-arcade-launch-checks')
EVIDENCE = Path('/home/kulmisiu/dev/dota2-trivia/docs/audits/2026-10-06/launch-checks/hosting')
BRANCH = 'codex/launch-checks-20261006'
headers = {'Authorization': 'Bearer ' + os.environ['RENDER_API_KEY'], 'Content-Type': 'application/json'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, response_headers, new_url):
        # Every Render API call must remain on its original URL. Never forward credentials.
        return None


opener = urllib.request.build_opener(NoRedirect())

def api(suffix='', method='GET', body=None, *, with_status=False, timeout=30):
    request = urllib.request.Request(BASE + suffix, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
    with opener.open(request, timeout=timeout) as response:
        raw = response.read(2_000_001)
        assert len(raw) <= 2_000_000, 'Provider response exceeds the bound.'
        result = json.loads(raw) if raw else None
        return (response.status, result) if with_status else result

def record(name, value):
    value = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), **value}
    (EVIDENCE / name).write_text(json.dumps(value, indent=2) + '\n')
    print(json.dumps(value))

def checked_candidate():
    candidate = json.loads((OUT / 'candidate-commit.json').read_text())
    assert candidate['branch'] == BRANCH and candidate['originalIndexUnchanged']
    sha = candidate['commit']
    assert len(sha) == 40 and all(c in '0123456789abcdef' for c in sha)
    remote = json.loads(subprocess.check_output(['gh', 'api', f'repos/Qqkyu/dota2-trivia/git/ref/heads/{BRANCH}']))
    assert remote['object']['sha'] == sha, 'Remote candidate does not match reviewed commit.'
    runs = json.loads(subprocess.check_output(['gh', 'api', f'repos/Qqkyu/dota2-trivia/actions/runs?head_sha={sha}&per_page=100']))
    passed = [run for run in runs['workflow_runs'] if run['head_sha'] == sha and run['path'] == '.github/workflows/ci.yml' and run['status'] == 'completed' and run['conclusion'] == 'success']
    assert passed, 'No completed passing CI run for the exact candidate.'
    return sha, passed[0]['id']

def checked_service():
    service = api()
    assert service['id'] == SID and service['name'] == 'queue-arcade'
    assert service['repo'] == 'https://github.com/Qqkyu/dota2-trivia'
    assert service['ownerId'] == 'tea-cspsf9i3esus738f3t4g'
    assert service['autoDeployTrigger'] == 'off'
    details = service['serviceDetails']
    assert details['plan'] == 'free' and details['buildPlan'] == 'starter'
    assert details['region'] == 'frankfurt' and details['numInstances'] == 1
    assert details['healthCheckPath'] == '/api/health'
    values = api('/env-vars?limit=100')
    assert len(values) < 100
    env = {row['envVar']['key']: row['envVar']['value'] for row in values}
    assert env['ARCADE_APP_URL'] == 'https://queue-arcade.onrender.com'
    assert env['ARCADE_ALLOW_FILE_STORE'] == 'false' and env['ARCADE_AUTO_MIGRATE'] == 'false'
    assert env['ARCADE_TRUST_PROXY'] == 'none', 'Ingress policy changed before proof.'
    assert len(env['ARCADE_AUTH_SECRET']) >= 32 and len(env['ARCADE_VOTER_SALT']) >= 32
    url = urlparse(env['DATABASE_URL'])
    assert url.hostname == 'dpg-d9mqc4taeets73aiclsg-a'
    assert url.username == 'queue_arcade_runtime_20261006'
    assert url.path == '/queue_arcade_db' and url.query == 'sslmode=require'
    return service


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def parsed_time(value):
    assert isinstance(value, str)
    result = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    assert result.tzinfo is not None, 'Provider timestamp must include a timezone.'
    return result


def suspension_conflict(error):
    # Provider messages are inspected in memory only. Never return or print them.
    raw = error.read(16_385)
    if len(raw) > 16_384:
        return False
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return False
    if not isinstance(body, dict):
        return False
    message = body.get('message', body.get('error'))
    if not isinstance(message, str):
        return False
    message = ' '.join(message.lower().split())
    return bool(re.search(r"\bservice (?:is |is currently |has been )suspended\b|\bsuspended service\b", message))


def list_deploys():
    rows = api('/deploys?limit=20', timeout=10)
    assert isinstance(rows, list)
    return [row['deploy'] for row in rows]


def public_deploy(row):
    result = {key: row.get(key) for key in ['id', 'status', 'trigger', 'createdAt', 'updatedAt', 'finishedAt']}
    result['commit'] = (row.get('commit') or {}).get('id')
    return result


def new_resume_deploys(deploys, prior):
    previous_ids = set(prior['previousDeployIds'])
    earliest = parsed_time(prior['requestedAt']) - datetime.timedelta(seconds=2)
    result = []
    for row in deploys:
        if row.get('id') in previous_ids:
            continue
        try:
            if parsed_time(row.get('createdAt')) >= earliest:
                result.append(row)
        except (AssertionError, ValueError, TypeError):
            continue
    return result


def suspend_wrong_deploy(base, row):
    # Suspending first limits exposure even if canceling the build later fails.
    api('/suspend', 'POST', timeout=10)
    result = {**base, 'unexpectedDeployId': row.get('id'),
              'unexpectedCommit': (row.get('commit') or {}).get('id'),
              'suspendRequested': True, 'externalHealthChecksAllowed': False}
    deploy_id = row.get('id')
    if (isinstance(deploy_id, str) and re.fullmatch(r'dep-[a-z0-9]+', deploy_id)
            and row.get('status') not in ['live', 'deactivated', 'canceled', 'build_failed', 'update_failed', 'pre_deploy_failed']):
        try:
            api('/deploys/' + deploy_id + '/cancel', 'POST', timeout=10)
            result['cancelRequested'] = True
        except Exception:
            result['cancelRequested'] = False
    after = api(timeout=10)
    result['serviceSuspended'] = after.get('suspended') == 'suspended'
    record('candidate-deploy-halted.json', result)
    raise RuntimeError('Unexpected commit after resume; suspension requested.')


def check_resume_deploys(base, deploys, prior):
    new = new_resume_deploys(deploys, prior)
    for row in new:
        commit = (row.get('commit') or {}).get('id')
        if commit is not None and commit != base['commit']:
            suspend_wrong_deploy(base, row)
    matching = [row for row in new if (row.get('commit') or {}).get('id') == base['commit']]
    return new, matching

def main():
    assert len(sys.argv) == 2 and sys.argv[1] in ['--prepare', '--deploy', '--resume', '--poll']
    phase = sys.argv[1]
    sha, run_id = checked_candidate()
    service = checked_service()
    base = {'serviceId': SID, 'commit': sha, 'ciRunId': run_id, 'plan': 'free', 'buildPlan': 'starter', 'trustedProxy': 'none'}
    if phase == '--prepare':
        assert service['suspended'] == 'suspended' and service['suspenders'] == ['user']
        assert service['branch'] in ['main', BRANCH]
        api(method='PATCH', body={'branch': BRANCH, 'autoDeployTrigger': 'off'})
        after = checked_service()
        assert after['branch'] == BRANCH and after['suspended'] == 'suspended'
        record('candidate-configuration.json', {**base, 'branch': BRANCH, 'serviceStillPaused': True, 'plansUnchanged': True})
    elif phase == '--deploy':
        assert service['branch'] == BRANCH
        try:
            status, deploy = api('/deploys', 'POST', {'commitId': sha, 'clearCache': 'do_not_clear'}, with_status=True)
        except urllib.error.HTTPError as error:
            if error.code not in (400, 409):
                raise
            suspended_reason = suspension_conflict(error)
            current = checked_service()
            still_paused = current['suspended'] == 'suspended' and current['suspenders'] == ['user']
            record('paused-deploy-attempt.json', {**base, 'httpStatus': error.code,
                   'suspensionConflictConfirmed': suspended_reason, 'serviceStillPaused': still_paused})
            assert suspended_reason and still_paused, 'Deploy error was not a verified user-suspension conflict.'
            return
        assert status in [201, 202]
        if deploy is not None:
            assert isinstance(deploy, dict)
            reported_commit = (deploy.get('commit') or {}).get('id')
            if reported_commit is not None and reported_commit != sha:
                suspend_wrong_deploy(base, deploy)
        record('candidate-deploy.json', {**base, 'httpStatus': status, 'queued': status == 202,
               'deployId': deploy.get('id') if deploy else None,
               'status': deploy.get('status') if deploy else None,
               'createdAt': deploy.get('createdAt') if deploy else None,
               'commitVerified': bool(deploy and (deploy.get('commit') or {}).get('id') == sha),
               'pollRequired': True, 'externalHealthChecksAllowed': False})
    elif phase == '--resume':
        prior = json.loads((EVIDENCE / 'paused-deploy-attempt.json').read_text())
        assert prior['serviceId'] == SID and prior['commit'] == sha and prior['ciRunId'] == run_id
        assert prior['httpStatus'] in (400, 409) and prior['serviceStillPaused'] and prior['suspensionConflictConfirmed']
        age = (utc_now() - parsed_time(prior['checkedAt'])).total_seconds()
        assert 0 <= age <= 900, 'Suspension evidence expired; repeat the paused deploy attempt.'
        assert service['branch'] == BRANCH and service['suspended'] == 'suspended' and service['suspenders'] == ['user']
        previous = list_deploys()
        result = {**base, 'resumeAttempted': True, 'resumeAcknowledged': False,
                  'requestedAt': utc_now().isoformat(), 'branch': BRANCH, 'plansUnchanged': True,
                  'previousDeployIds': [row['id'] for row in previous],
                  'pollRequired': True, 'externalHealthChecksAllowed': False}
        record('candidate-resume.json', result)
        api('/resume', 'POST')
        result['resumeAcknowledged'] = True
        record('candidate-resume.json', result)
        # This is a bounded selection check. A later --poll must verify a live deploy.
        for attempt in range(4):
            deploys = list_deploys()
            new, matching = check_resume_deploys(base, deploys, result)
            if matching:
                result['verification'] = 'candidate_build_observed'
                result['observedDeploys'] = [public_deploy(row) for row in new]
                break
            result['verification'] = 'commit_not_reported_yet' if new else 'no_new_deploy_yet'
            if attempt < 3:
                time.sleep(1)
        record('candidate-resume.json', result)
    else:
        assert service['branch'] == BRANCH
        deploys = list_deploys()
        resume_file = EVIDENCE / 'candidate-resume.json'
        if resume_file.exists():
            prior = json.loads(resume_file.read_text())
            if prior.get('serviceId') == SID and prior.get('commit') == sha:
                check_resume_deploys(base, deploys, prior)
        current = [public_deploy(row) for row in deploys]
        live = [row for row in current if row['status'] == 'live']
        allowed = service['suspended'] == 'not_suspended' and len(live) == 1 and live[0]['commit'] == sha
        record('candidate-deploy-status.json', {**base, 'suspended': service['suspended'],
               'deploys': current, 'externalHealthChecksAllowed': allowed})

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not print request bodies, environment values, headers, or provider payloads.
        print(json.dumps({'ok': False, 'errorType': type(error).__name__, 'httpStatus': getattr(error, 'code', None)}))
        sys.exit(1)
