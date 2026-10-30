// Preload voor een ECHTE agent (deploy/agent/agent.mjs) in e2e-tests: *.tarasevych.com → 127.0.0.1 (de lokale testserver),
// elke andere hostnaam bestaat niet. Zo kan de agent in een test nooit productie of internet bereiken.
import dns from 'node:dns';
const orig = dns.lookup;
dns.lookup = function (host, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  const h = String(host).toLowerCase();
  if (/(^|\.)tarasevych\.com$/.test(h) || h === 'localhost' || h === '127.0.0.1') {
    return process.nextTick(() => (opts && opts.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)));
  }
  const e = Object.assign(new Error(`e2e-agent: ${host} geweigerd (alleen lokaal)`), { code: 'ENOTFOUND' });
  return process.nextTick(() => cb(e));
};
void orig;
