# Lokale browsertest (Playwright) — alleen voor ontwikkeling

Bootst de productieketen na: browser → https (zelfondertekend, `*.tarasevych.com`) → `proxy.mjs`
(zoals de Cloudflare-tunnel: TLS eraf, `cf-connecting-ip` erbij) → `node dist-server/start.mjs` op 127.0.0.1:8080.
Nodig omdat de sessiecookie `Secure` + `Domain=.tarasevych.com` is en dus alleen via https op die hostnamen werkt.

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright-core pg
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 \
  -subj "/CN=*.tarasevych.com" -addext "subjectAltName=DNS:*.tarasevych.com"
cp <repo>/scripts/lokaal-e2e/*.mjs . && node proxy.mjs &
DATABASE_URL=... node e2e.mjs   # Chrome: --host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:8443
```

Dekt `tests/tests.txt` test 1 (afgemelde shell) en test 3 (aangemelde Hub-overzicht), plus één cookie over
subdomeinen en CSP-schendingen. De sessie wordt rechtstreeks in de database gezaaid (Google is nog niet
geconfigureerd) en na afloop opgeruimd. Nooit tegen productie draaien.
