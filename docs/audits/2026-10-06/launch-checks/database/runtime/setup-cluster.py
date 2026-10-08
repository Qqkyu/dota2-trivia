import json
import os
import pwd
from pathlib import Path
import socket
import subprocess

root = Path('/tmp/queue-arcade-launch-checks/pg-runtime')
root.mkdir(parents=True, exist_ok=True)
if (root / 'cluster.json').exists() or (root / 'data').exists():
    raise SystemExit('Refusing to replace an existing audit cluster')
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
(root / 'socket').mkdir(mode=0o700)
pgbin = '/usr/lib/postgresql/14/bin'
init = subprocess.run([pgbin + '/initdb', '-D', str(root / 'data'), '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale'], capture_output=True, text=True)
(root / 'initdb.log').write_text(init.stdout + init.stderr)
init.check_returncode()
with (root / 'data/postgresql.conf').open('a') as config:
    config.write(f"\nlisten_addresses = '127.0.0.1'\nport = {port}\nunix_socket_directories = '{root}/socket'\nfsync = on\nfull_page_writes = on\nsynchronous_commit = on\ndeadlock_timeout = '100ms'\nlog_lock_waits = on\nlog_min_error_statement = error\n")
marker = {'root': str(root), 'data': str(root / 'data'), 'socket': str(root / 'socket'), 'port': port, 'owner': os.getuid(), 'user': pwd.getpwuid(os.getuid()).pw_name, 'pgbin': pgbin, 'auditOnly': True}
(root / 'cluster.json').write_text(json.dumps(marker, indent=2) + '\n')
subprocess.run([pgbin + '/pg_ctl', '-D', marker['data'], '-l', str(root / 'postgres.log'), '-w', 'start'], check=True)
for database in ['qa_launch_runtime', 'qa_launch_migrations', 'qa_launch_backup']:
    subprocess.run([pgbin + '/createdb', '-h', marker['socket'], '-p', str(port), database], check=True)
print(json.dumps(marker))
