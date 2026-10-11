import assert from 'node:assert/strict';
const url = process.argv[2];
const deadline = Number(process.argv[3]);
const delay = Number(process.argv[4]);
const keepAlive = process.argv[5] === 'keep';
const interval = keepAlive ? setInterval(() => {}, 1000) : null;
const sleep = ms => new Promise(done => setTimeout(done, ms));
let health;
try {
  for (let attempt = 0; ; attempt++) {
    try {
      console.log(JSON.stringify({ event: 'start', attempt }));
      const response = await fetch(url, { signal: AbortSignal.timeout(deadline) });
      console.log(JSON.stringify({ event: 'headers', attempt, status: response.status }));
      health = await response.json();
      if (response.ok && health.status === 'ready') break;
    } catch (error) { console.log(JSON.stringify({ event: 'caught', attempt, name: error.name, message: error.message })); }
    assert(attempt < 10, 'Application readiness timed out');
    await sleep(delay);
  }
  console.log(JSON.stringify({ event: 'ready', health }));
} finally { if (interval) clearInterval(interval); }
