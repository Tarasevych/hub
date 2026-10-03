// Test-https-proxy die de Cloudflare-tunnel nabootst (TLS eraf, cf-connecting-ip erbij).
import https from 'node:https'; import http from 'node:http'; import { readFileSync } from 'node:fs';
https.createServer({ key: readFileSync('process.env.TLS_KEY || '/tmp/pw/key.pem''), cert: readFileSync('process.env.TLS_CERT || '/tmp/pw/cert.pem'') }, (req, res) => {
  const headers = { ...req.headers, 'cf-connecting-ip': '198.51.100.9' };
  const up = http.request({ host: '127.0.0.1', port: 8080, path: req.url, method: req.method, headers }, r => { res.writeHead(r.statusCode, r.rawHeaders); r.pipe(res); });
  up.on('error', e => { res.writeHead(502); res.end(String(e)); }); req.pipe(up);
}).listen(8443, '127.0.0.1', () => console.log('proxy 8443'));
