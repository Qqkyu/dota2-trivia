import net from 'node:net';
import { writeFileSync } from 'node:fs';
const mode = process.argv[2];
let attempts = 0;
const server = net.createServer(socket => {
  const n = attempts++;
  if (mode === 'reset') socket.resetAndDestroy();
  else if (mode === 'destroy') socket.destroy();
  else if (mode === 'end') socket.end();
  else if (mode === 'write-close') socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n');
  else if (mode === 'partial-close') socket.end('HTTP/1.1 200 OK\r\nContent-Length: 99\r\n\r\n{"status":');
  else if (mode === 'delay-reset') setTimeout(() => socket.resetAndDestroy(), n % 4);
  else if (mode === 'alternating') { if (n % 2) socket.resetAndDestroy(); else socket.end('HTTP/1.1 200 OK\r\nContent-Length: 18\r\n\r\n{"status":"ready"}'); }
});
server.listen(0, '127.0.0.1', () => writeFileSync(process.argv[3], JSON.stringify({port: server.address().port})));
