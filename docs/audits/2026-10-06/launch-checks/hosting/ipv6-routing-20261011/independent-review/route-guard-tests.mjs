import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { curlArgs as oldArgs } from '../../hosted-smoke-preparation/v2/check-address-isolation.mjs';
import { curlArgs, runIsolation } from '../../hosted-smoke-preparation/v2/check-address-isolation-edge-v3.mjs';

const originalUrl = new URL('../../hosted-smoke-preparation/v2/check-address-isolation.mjs', import.meta.url);
const newUrl = new URL('../../hosted-smoke-preparation/v2/check-address-isolation-edge-v3.mjs', import.meta.url);
const original = await readFile(originalUrl, 'utf8');
const current = await readFile(newUrl, 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const tests = [];
async function test(name, operation) { await operation(); tests.push({ name, passed: true }); }
const auth = 'https://queue-arcade.onrender.com/api/auth/steam';
const route = 'queue-arcade.onrender.com:443:www.cloudflare.com:443';

await test('both complete helper files match the review pins', () => {
  assert.equal(sha(original), 'fe1c62d1e08978f9f6f858b896dd0e3fee31083384764de5cea54356c07163e4');
  assert.equal(sha(current), '932be267c45efb0c3a262c1f6f9c0aa5eb556167ea1571b3cfd7867728dedd97');
});
await test('the complete change contains only the route and report metadata edits', () => {
  let expected = original.replace(", ...(headers ? ['--output'", ", ...(url === ORIGIN + '/api/auth/steam' ? ['--connect-to', 'queue-arcade.onrender.com:443:www.cloudflare.com:443'] : []), ...(headers ? ['--output'");
  expected = expected.replace('const report = { version: 2, spoofHeadersTested:', "const report = { version: 3, ipv6ApplicationRoute: 'cloudflare-shared-edge-connect-to', ipv6ConnectionHostname: 'www.cloudflare.com', originHostAndSniPreserved: true, tlsVerificationEnabled: true, spoofHeadersTested:");
  expected = expected.replace("'address-isolation-v2-'", "'address-isolation-edge-v3-'");
  assert.equal(current, expected);
});
for (const source of ['https://api64.ipify.org/', 'https://www.cloudflare.com/cdn-cgi/trace']) {
  await test('the independent address source keeps its original transport: ' + source, () => {
    for (const seconds of [1, 4, 8]) for (const headers of [false, true]) {
      assert.deepEqual(curlArgs(source, headers, seconds), oldArgs(source, headers, seconds));
      assert(!curlArgs(source, headers, seconds).includes('--connect-to'));
    }
  });
}
await test('only the exact auth URL receives one fixed route and keeps every original option', () => {
  for (const seconds of [1, 4, 8]) for (const headers of [false, true]) {
    const args = curlArgs(auth, headers, seconds);
    assert.equal(args.filter(v => v === '--connect-to').length, 1);
    const offset = args.indexOf('--connect-to');
    assert.equal(args[offset + 1], route);
    assert.equal(args.at(-1), auth);
    args.splice(offset, 2);
    assert.deepEqual(args, oldArgs(auth, headers, seconds));
  }
});
await test('path, port, scheme, credential, query and host variants remain forbidden', () => {
  for (const url of [auth + '/', auth + '?next=https://example.test', auth + '#fragment', auth.replace('https:', 'http:'), auth.replace('.com/', '.com:443/'), auth.replace('https://', 'https://name:password@'), auth.replace('/api/auth/steam', '/api/health'), auth.replace('queue-arcade.onrender.com', 'www.cloudflare.com')]) assert.throws(() => curlArgs(url));
});
await test('invalid deadlines cannot widen the subprocess budget', () => {
  for (const value of [0, -1, 9, 4.5, '4', Infinity, NaN]) assert.throws(() => curlArgs(auth, true, value));
});
await test('the route has no Host override, TLS bypass, redirects or credentials', () => {
  const args = curlArgs(auth, true, 4);
  for (const forbidden of ['-k', '--insecure', '-H', '--header', '-L', '--location', '--location-trusted', '-b', '--cookie', '-c', '--cookie-jar', '-u', '--user', '--proxy', '--proxy-insecure', '--resolve']) assert(!args.includes(forbidden));
  assert.deepEqual(args.slice(0, 4), ['--disable', '--ipv6', '--proto', '=https']);
  assert.equal(args[args.indexOf('--max-time') + 1], '4');
  assert.equal(args[args.indexOf('--max-filesize') + 1], '16384');
});
await test('a passing result identifies the manual edge route without retaining addresses or cookies', async () => {
  let ticks = 1791690000000;
  const resetAt = ticks + 60000;
  const saved = [];
  let probes = 0;
  let sources = 0;
  const result = await runIsolation({
    now: () => ticks,
    checkpoint: async report => saved.push(structuredClone(report)),
    probe: async index => { probes++; ticks += 20; return index !== undefined && index < 120 ? { status: 302 } : { status: 429, resetAt }; },
    source: async (url, headers, seconds) => {
      sources++;
      if (url === 'https://api64.ipify.org/') return { status: 200, body: '2001:db8::42' };
      if (url === 'https://www.cloudflare.com/cdn-cgi/trace') return { status: 200, body: 'ip=2001:db8::42\n' };
      assert.equal(url, auth); assert.equal(headers, true); assert(seconds <= 4);
      return { status: 302, body: 'HTTP/2 302\r\nlocation: https://steamcommunity.com/openid/login\r\nset-cookie: synthetic-marker=private\r\n' };
    },
  });
  assert.equal(probes, 131); assert.equal(sources, 3);
  assert.equal(result.version, 3);
  assert.equal(result.ipv6ApplicationRoute, 'cloudflare-shared-edge-connect-to');
  assert.equal(result.ipv6ConnectionHostname, 'www.cloudflare.com');
  assert.equal(result.originHostAndSniPreserved, true);
  assert.equal(result.tlsVerificationEnabled, true);
  assert.equal(result.deploymentAndConfigurationStable, false);
  assert.equal(result.appDataWrites, 0);
  assert.equal(result.redirectsFollowed, 0);
  assert.equal(result.ok, true);
  assert(!JSON.stringify(saved).includes('2001:db8'));
  assert(!JSON.stringify(saved).includes('synthetic-marker'));
});
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), hostedRequests: 0, operatorSha256: sha(current), passed: tests.length, cases: tests }, null, 2));
