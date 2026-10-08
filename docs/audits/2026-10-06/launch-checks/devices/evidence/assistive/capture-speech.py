#!/usr/bin/python3
import sys,time,json,subprocess,pathlib,wave
base=pathlib.Path('/tmp/queue-arcade-launch-checks/assistive/session/speech')
text=sys.stdin.read()
stamp=str(time.time_ns())
path=base/(stamp+'.wav')
result=subprocess.run(['/tmp/queue-arcade-launch-checks/assistive/root/usr/bin/espeak-ng','-v','en-us','-s',sys.argv[1],'-w',str(path),'--stdin'],input=text,text=True,capture_output=True)
record={'at':stamp,'text':text,'wav':str(path),'exit':result.returncode,'error':result.stderr}
if result.returncode==0:
 with wave.open(str(path)) as wav: record['duration']=wav.getnframes()/wav.getframerate()
with (base/'utterances.jsonl').open('a') as output: output.write(json.dumps(record)+'\n')
