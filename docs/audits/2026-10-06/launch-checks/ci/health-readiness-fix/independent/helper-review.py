import json,pathlib,subprocess,time
ROOT=pathlib.Path('/tmp/queue-arcade-health-wait-review')
NODE='/tmp/queue-arcade-launch-checks/tools/node22/bin/node'
results=[]
cases=[('normal','normal',500,'settled'),('service-unavailable','normal',500,'settled'),('delayed-body','normal',100,'caught'),('stall','normal',100,'caught'),('end','parser-delay',300,'caught'),('normal','parser-delay',500,'settled'),('normal','ignores-abort',100,'caught')]
for server_mode,client_mode,deadline,expected in cases:
  state=ROOT/f'helper-state-{server_mode}-{client_mode}.json';state.unlink(missing_ok=True)
  script='tcp-server.mjs' if server_mode=='end' else 'server.mjs'
  server=subprocess.Popen([NODE,str(ROOT/script),server_mode,str(state)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  try:
    started=time.monotonic()
    while not state.exists() and time.monotonic()-started<3:time.sleep(.01)
    port=json.loads(state.read_text())['port']
    child=subprocess.run([NODE,str(ROOT/'helper-review-client.mjs'),f'http://127.0.0.1:{port}/api/health',client_mode,str(deadline)],capture_output=True,text=True,timeout=3)
    events=[json.loads(line) for line in child.stdout.splitlines()]
    item={'server':server_mode,'client':client_mode,'deadlineMs':deadline,'exit':child.returncode,'events':events,'stderr':child.stderr}
    results.append(item)
    print(json.dumps(item),flush=True)
    assert child.returncode==0,item
    assert [x['event'] for x in events]==[expected,'finally'],item
    assert events[0]['elapsedMs']<deadline+500,item
    if client_mode=='ignores-abort':assert events[0]['aborted'] is True,item
    if server_mode=='service-unavailable':assert events[0]['ok'] is False,item
  finally:server.terminate();server.wait(timeout=3)
(ROOT/'helper-review-result.json').write_text(json.dumps(results,indent=2)+'\n')
