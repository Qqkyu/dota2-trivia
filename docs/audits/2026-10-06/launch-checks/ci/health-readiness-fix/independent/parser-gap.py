import json, pathlib, subprocess, time
ROOT=pathlib.Path('/tmp/queue-arcade-health-wait-review')
NODE='/tmp/queue-arcade-launch-checks/tools/node22/bin/node'
results=[]
for server_mode in ['reset','destroy','end','delay-reset','write-close']:
  state=ROOT/f'parser-state-{server_mode}.json';state.unlink(missing_ok=True)
  server=subprocess.Popen([NODE,str(ROOT/'tcp-server.mjs'),server_mode,str(state)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  try:
    started=time.monotonic()
    while not state.exists() and time.monotonic()-started<3:time.sleep(.01)
    port=json.loads(state.read_text())['port']
    for mode in ['normal','slow','slow-ref']:
      for n in range(4):
        log=ROOT/f'parser-{server_mode}-{mode}-{n}.jsonl';log.unlink(missing_ok=True)
        result=subprocess.run([NODE,str(ROOT/'parser-gap-client.mjs'),f'http://127.0.0.1:{port}/api/health',mode,str(log)],capture_output=True,text=True,timeout=5)
        item={'server':server_mode,'mode':mode,'replicate':n,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'events':[json.loads(line) for line in log.read_text().splitlines()]}
        results.append(item)
      print(json.dumps({'server':server_mode,'mode':mode,'exits':[x['exit'] for x in results[-4:]]}),flush=True)
  finally:server.terminate();server.wait(timeout=3)
(ROOT/'parser-gap-result.json').write_text(json.dumps(results,indent=2)+'\n')
