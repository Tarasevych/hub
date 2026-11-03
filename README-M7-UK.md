# Cloud Full Integration M7 · Security-first development kit

База: M6 DevKit із робочого архіву 20261027-212158 (не потвердження поточної production-версії).

## Перевірити

```bash
node --test tests/eenheid/cloud-*mjs
node scripts/cloud-volledige-uitgave-poort.mjs
node scripts/kaart-controle.mjs --stil
```

Expected: unit tests pass; release gate returns BLOCKED (exit 2); file map no errors.

**Не встановлювати** в production, не оновлювати GitHub main, не застосовувати міграцій без staging. Не вставляти user recovery key або PRF output в лог, аналітику, мережевий запит чи серверний HTML.

Опис меж довіри та незакритих питань: `docs/CLOUD-M7-PRIVACY-ARCHITECTURE.uk.md`.
