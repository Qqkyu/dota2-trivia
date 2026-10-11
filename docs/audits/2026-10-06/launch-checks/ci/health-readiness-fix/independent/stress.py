import concurrent.futures, json, pathlib, socket, subprocess, time
ROOT=pathlib.Path('/tmp/queue-arcade-health-wait-review')
NODE='/tmp/queue-arcade-launch-checks/tools/node22/bin/node'
results=[]
def check(url, mode, n):
  result=subprocess.run([NODE,str(ROOT/'stress-client.mjs'),url,'100','spawn',str(ROOT/f'spawn-{mode}-{n}.log')],capture_output=True,text=True,timeout=30)
  return {'mode':mode,'replicate':n,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr}
for mode in ['refused','reset','destroy','end','write-close','partial-close','delay-reset','alternating']:
  state=ROOT/f'tcp-{mode}.json'
  state.unlink(missing_ok=True)
  server=None
  try:
    if mode=='refused':
      sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
    else:
      server=subprocess.Popen([NODE,str(ROOT/'tcp-server.mjs'),mode,str(state)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
      started=time.monotonic()
      while not state.exists() and time.monotonic()-started<3:time.sleep(.01)
      port=json.loads(state.read_text())['port']
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
      batch=list(pool.map(lambda n:check(f'http://127.0.0.1:{port}/api/health',mode,n),range(16)))
    results.extend(batch)
    print(json.dumps({'mode':mode,'exits':[x['exit'] for x in batch]}),flush=True)
  finally:
    if server:server.terminate();server.wait(timeout=3)
(ROOT/'stress-result.json').write_text(json.dumps(results,indent=2)+'\n')
assert not any(x['exit']==13 for x in results),'Reproduced unsettled top-level await'
