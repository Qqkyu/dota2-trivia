import json
import os
from pathlib import Path
import subprocess
import time

root = Path('/tmp/queue-arcade-launch-checks/pg-runtime')
marker = json.loads((root / 'cluster.json').read_text())
assert marker['auditOnly'] is True
assert marker['owner'] == os.getuid()
assert Path(marker['data']).resolve() == root / 'data'
assert (root / 'data').stat().st_uid == os.getuid()
pgbin = Path(marker['pgbin'])
psql = [str(pgbin / 'psql'), '-h', marker['socket'], '-p', str(marker['port']), '-d', 'qa_launch_runtime', '-At', '-v', 'ON_ERROR_STOP=1']

def query(statement):
    return subprocess.run(psql + ['-c', statement], check=True, capture_output=True, text=True).stdout.strip()

assert query('SHOW data_directory') == marker['data']
version = query('SHOW server_version')
connections = query("SELECT count(*) FROM pg_stat_activity WHERE backend_type = 'client backend' AND pid <> pg_backend_pid()")
assert connections == '0', 'Other audit clients still connected: ' + connections
steps = []
log_offset = (root / 'postgres.log').stat().st_size

def pgctl(*args):
    result = subprocess.run([str(pgbin / 'pg_ctl'), '-D', marker['data'], '-w', '-t', '30', *args], capture_output=True, text=True)
    steps.append({'command': ['pg_ctl', *args], 'code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    result.check_returncode()

pgctl('-m', 'smart', 'stop')
pgctl('-l', str(root / 'postgres.log'), 'start')
result = subprocess.run(['node', 'scripts/check-db-runtime.mjs', 'snapshot'], capture_output=True, text=True)
(root / 'graceful-verify.log').write_text(result.stdout + result.stderr)
result.check_returncode()
signal = root / 'server-recovered.signal'
for temporary in [signal, root / 'post-recovery-result.json', root / 'inflight-result.json']:
    temporary.unlink(missing_ok=True)
environment = dict(os.environ)
environment.pop('AUDIT_DB_KEEP_POOL_OPEN', None)
environment['AUDIT_DB_RECOVER_SIGNAL'] = str(signal)
worker = subprocess.Popen(['node', 'scripts/check-db-runtime.mjs', 'inflight'], env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
schema = json.loads((root / 'runtime-result.json').read_text())['schema']
assert schema.startswith('runtime_') and schema.replace('_', '').isalnum()
try:
    deadline = time.monotonic() + 15
    while True:
        if worker.poll() is not None:
            raise RuntimeError('In-flight writer exited before crash: ' + ''.join(worker.communicate()))
        waiting = query("SELECT count(*) FROM pg_stat_activity WHERE datname='qa_launch_runtime' AND application_name='" + schema + "' AND wait_event='PgSleep'")
        if waiting == '1':
            break
        if time.monotonic() >= deadline:
            raise RuntimeError('Writer did not reach the final analytics trigger')
        time.sleep(0.05)
    assert query('SELECT count(*) FROM ' + schema + ".queue_arcade_rounds WHERE round_id='round-crash-uncommitted'") == '0'
    steps.append({'inflightPausedAt': 'analytics insert trigger', 'uncommittedRoundVisibleToOtherConnection': False})
    pgctl('-m', 'immediate', 'stop')
    pgctl('-l', str(root / 'postgres.log'), 'start')
    result = subprocess.run(['node', 'scripts/check-db-runtime.mjs', 'verify'], capture_output=True, text=True)
    (root / 'crash-verify.log').write_text(result.stdout + result.stderr)
    result.check_returncode()
    assert query('SELECT count(*) FROM ' + schema + ".queue_arcade_rounds WHERE round_id='round-crash-uncommitted'") == '0'
    query('DROP TRIGGER pause_crash_alpha ON ' + schema + '.queue_arcade_alpha_sessions')
    signal.touch()
    stdout, stderr = worker.communicate(timeout=20)
    (root / 'crash-writer.log').write_text(stdout + stderr)
    steps.append({'workerExitCode': worker.returncode, 'workerStdout': stdout, 'workerStderr': stderr})
    assert worker.returncode == 0, 'The client process must survive the interruption: ' + stdout + stderr
    resumed = json.loads((root / 'post-recovery-result.json').read_text())
    assert resumed['samePoolRecovered'] and resumed['freshVoteAccepted'] and resumed['retryDeduplicated']
    result = {'ok': True, 'serverVersion': version, 'steps': steps, 'gracefulSnapshotMatches': True, 'crashSnapshotMatches': True, 'inflightPartialWritesVisible': False, 'workerExitCode': worker.returncode, 'samePoolRecovered': True, 'freshVoteAccepted': True, 'retryDeduplicated': True}
    (root / 'restart-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
finally:
    if worker.poll() is None:
        worker.terminate()
        worker.wait(timeout=5)
    (root / 'restart-steps.json').write_text(json.dumps(steps, indent=2) + '\n')
    (root / 'recovery.log').write_bytes((root / 'postgres.log').read_bytes()[log_offset:])
