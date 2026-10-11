import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
const url = process.argv[2];
const count = Number(process.argv[3]);
let completed = 0, failed = 0;
if (process.argv[4] === 'spawn') {
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready")'], {stdio:['pipe','pipe','pipe']});
  const log = createWriteStream(process.argv[5]);
  child.stdout.on('data', data => log.write(data));
  child.stdin.end();
  await new Promise(resolve => child.on('exit',resolve));
  await new Promise(resolve => log.end(resolve));
}
for (let i=0;i<count;i++) {
  try { const response = await fetch(url,{signal:AbortSignal.timeout(100)}); await response.json(); completed++; }
  catch { failed++; }
}
console.log(JSON.stringify({completed,failed}));
