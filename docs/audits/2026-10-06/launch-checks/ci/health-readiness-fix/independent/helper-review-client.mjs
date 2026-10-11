import { readHealthWithDeadline } from '/home/kulmisiu/dev/dota2-trivia/scripts/lib/health-readiness.mjs';
const url = process.argv[2];
const mode = process.argv[3];
const timeoutMs = Number(process.argv[4]);
if (mode === 'parser-delay') {
  const compile = WebAssembly.compile;
  WebAssembly.compile = async function(...args) {
    const result = await compile.apply(this, args);
    await new Promise(resolve => setTimeout(resolve,100).unref());
    return result;
  };
}
let signal;
if (mode === 'ignores-abort') globalThis.fetch = (_url, options) => { signal=options.signal; return new Promise(()=>{}); };
const started=performance.now();
try {
  const result = await readHealthWithDeadline(url, timeoutMs);
  console.log(JSON.stringify({event:'settled',ok:result.ok,status:result.health.status,elapsedMs:performance.now()-started}));
} catch(error) {
  console.log(JSON.stringify({event:'caught',name:error.name,message:error.message,elapsedMs:performance.now()-started,aborted:signal?.aborted}));
} finally { console.log(JSON.stringify({event:'finally'})); }
