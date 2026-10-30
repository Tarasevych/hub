// Test-https-proxy voor de ruimtes-suites (eigen poorten, naast andere agents). Bootst de Cloudflare-tunnel na. ALLEEN LOKAAL.
// RU_PROXY_POORT (standaard 8494) → 127.0.0.1:RU_APP_POORT (standaard 8094).
import https from 'node:https'; import http from 'node:http'; import { readFileSync } from 'node:fs';
const UIT = Number(process.env.RU_PROXY_POORT || 8494), IN = Number(process.env.RU_APP_POORT || 8094);
https.createServer({ key: readFileSync(process.env.TLS_KEY || '/tmp/pw/key.pem'), cert: readFileSync(process.env.TLS_CERT || '/tmp/pw/cert.pem') }, (req, res) => {
  const headers = { ...req.headers, 'cf-connecting-ip': '198.51.100.9' };
  if (headers.origin) headers.origin = String(headers.origin).replace(new RegExp(`:${UIT}$`), '');
  const up = http.request({ host: '127.0.0.1', port: IN, path: req.url, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.rawHeaders); r.pipe(res); });
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)); }); req.pipe(up);
}).listen(UIT, '127.0.0.1', () => console.log(`proxy ${UIT} → ${IN}`));
