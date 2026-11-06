> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./LEESMIJ.uk.md) · [🇳🇱 **Nederlandse versie**](./LEESMIJ.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Локальний браузерний тест (Playwright) — лише для розробки

Відтворює виробничий ланцюжок: браузер → https (самопідписаний, `*.tarasevych.com`) → `proxy.mjs`
(як тунель Cloudflare: знімає TLS, додає `cf-connecting-ip`) → `node dist-server/start.mjs` на `127.0.0.1:8080`.
Потрібно тому, що сесійний cookie має `Secure` + `Domain=.tarasevych.com` і працює лише через https на цих іменах хостів.

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm i playwright-core pg
openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 2 \
  -subj "/CN=*.tarasevych.com" -addext "subjectAltName=DNS:*.tarasevych.com"
cp <repo>/scripts/lokaal-e2e/*.mjs . && node proxy.mjs &
DATABASE_URL=... node e2e.mjs   # Chrome: --host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:8443
```

Покриває тест 1 (оболонка без входу) і тест 2 (огляд Hub після входу) з `tests/tests.txt`, а також єдиний cookie між
піддоменами та порушення CSP. Сесія засівається безпосередньо в базу даних (оскільки Google ще не налаштований)
і прибирається після завершення. Ніколи не запускати проти production.

## Усе за один раз
`scripts/lokaal-e2e/test-alles.sh` перезапускає сервер і проксі та виконує димовий тест (включно з безпекою фази B),
юніт-тести (`scripts/eenheidstests.mjs`: PKCE, SSRF/DNS-pinning, ключі, блокування) і цей браузерний тест.
У файлі секретів (`GEHEIMEN=…`, типово `/workspace/.lokaal/geheimen.env`) потрібні: `DATABASE_URL`,
`TOTP_ENCRYPTION_KEY_V1`, `RECOVERY_CODE_PEPPER` (лише локальні тестові значення). Проксі прибирає `:8443` із
заголовка `Origin`, як справжній тунель (порт 443), щоб перевірка CSRF працювала так само, як у production.
