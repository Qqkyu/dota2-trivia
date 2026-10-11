import { appendFileSync } from 'node:fs';
const url = process.argv[2];
const mode = process.argv[3];
const log = process.argv[4];
const record = value => appendFileSync(log, JSON.stringify(value)+'\n');
process.on('beforeExit', () => record({ event: 'beforeExit', resources: process.getActiveResourcesInfo() }));
if (mode.startsWith('slow')) {
  const original = WebAssembly.compile;
  WebAssembly.compile = async function(...args) {
    record({ event: 'compile-start' });
    const result = await original.apply(this,args);
    record({ event: 'compile-native-complete' });
    await new Promise(resolve => setTimeout(resolve,100).unref());
    record({ event: 'compile-return' });
    return result;
  };
}
const controller = mode.endsWith('-ref') ? new AbortController() : null;
const timer = controller ? setTimeout(() => controller.abort(new Error('Referenced deadline')), 300) : null;
try {
  const response = await fetch(url, { signal: controller?.signal ?? AbortSignal.timeout(300) });
  record({ event: 'headers', status: response.status });
  await response.text();
  record({ event: 'settled' });
} catch(error) { record({event:'caught',name:error.name,message:error.message}); }
finally { if(timer) clearTimeout(timer); record({event:'finally'}); }
