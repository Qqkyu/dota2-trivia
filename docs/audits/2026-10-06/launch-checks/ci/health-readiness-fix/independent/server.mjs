import http from 'node:http';
import { writeFileSync } from 'node:fs';
const mode = process.argv[2];
const statePath = process.argv[3];
let count = 0;
const server = http.createServer((req, res) => {
  const attempt = ++count;
  const ready = () => { if (!res.destroyed) res.end(JSON.stringify({ status: 'ready', attempt })); };
  res.setHeader('Content-Type', 'application/json');
  if (mode === 'delayed-headers') setTimeout(ready, attempt < 4 ? 500 : 1);
  else if (mode === 'delayed-body') { res.writeHead(200); res.flushHeaders(); setTimeout(ready, attempt < 4 ? 500 : 1); }
  else if (mode === 'close') { if (attempt < 4) res.destroy(); else ready(); }
  else if (mode === 'partial-close') { res.writeHead(200); res.write('{"status":'); if(attempt < 4) setTimeout(() => res.destroy(), 50); else res.end('"ready"}'); }
  else if (mode === 'half-close') { if (attempt < 4) req.socket.end(); else ready(); }
  else if (mode === 'stall') {}
  else if (mode === 'keepalive-race') { res.setHeader('Keep-Alive', 'timeout=1'); res.setHeader('Connection', 'keep-alive'); res.end(JSON.stringify({ status: attempt < 4 ? 'waiting' : 'ready' })); }
  else if (mode === 'service-unavailable') { res.writeHead(attempt < 4 ? 503 : 200); res.end(JSON.stringify({ status: attempt < 4 ? 'waiting' : 'ready' })); }
  else ready();
});
server.keepAliveTimeout = mode === 'keepalive-race' ? 100 : 5000;
server.listen(0, '127.0.0.1', () => writeFileSync(statePath, JSON.stringify({ port: server.address().port })));
