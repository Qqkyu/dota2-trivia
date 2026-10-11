import json, os, pathlib, subprocess, time
ROOT = pathlib.Path('/tmp/queue-arcade-health-wait-review')
NODE = '/tmp/queue-arcade-launch-checks/tools/node22/bin/node'
results = []
for mode in ['normal','delayed-headers','delayed-body','close','partial-close','half-close','stall','keepalive-race','service-unavailable']:
  for keep in ['natural','keep']:
    state = ROOT / ('state-' + mode + '-' + keep + '.json')
    state.unlink(missing_ok=True)
    server = subprocess.Popen([NODE, str(ROOT/'server.mjs'), mode, str(state)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    try:
      started = time.monotonic()
      while not state.exists() and time.monotonic()-started < 3: time.sleep(.01)
      port = json.loads(state.read_text())['port']
      result = subprocess.run([NODE, str(ROOT/'client.mjs'), f'http://127.0.0.1:{port}/api/health', '100','100',keep], capture_output=True, text=True, timeout=8)
      item = {'mode':mode,'keepAlive':keep,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr}
      results.append(item)
      print(json.dumps({k:v for k,v in item.items() if k not in ['stdout','stderr']}), flush=True)
    finally:
      server.terminate()
      server.wait(timeout=3)
(ROOT/'result.json').write_text(json.dumps(results, indent=2)+'\n')
assert not any(x['exit']==13 for x in results), 'Reproduced unsettled top-level await'
