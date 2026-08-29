# Мій простір / Tarasevych Hub

Private source archive of the canonical AppDeploy app.

- App ID: `c28444ec7eb73654e9`
- Live snapshot: `1787991964750` (v75, p4-connections)
- Production host: AppDeploy
- Public URL: https://hub.tarasevych.com

This repository is **not** a second production runtime.
GitHub Pages cannot replace AppDeploy backend, database, secrets, cron, or custom domains.

## What lives here

One app, many hostnames:

- hub.tarasevych.com
- mail.tarasevych.com
- id.tarasevych.com
- api.tarasevych.com
- admin.tarasevych.com
- ai.tarasevych.com
- cloud.tarasevych.com
- github.tarasevych.com
- huis.tarasevych.com

Do not split these into separate GitHub repos. They are route/host aliases of the same snapshot.

## What must not be committed

- AppDeploy platform secrets
- OAuth client secrets
- encryption keys
- vault plaintext
- machine tokens

## Refresh from AppDeploy

1. AppDeploy dashboard → app `c28444ec7eb73654e9`
2. Applied version → Download Source
3. Unzip over this repo (keep `.gitignore` and this README if the zip has no equivalent)
4. `git add -A && git commit && git push`
5. Tag the snapshot: `git tag v75-1787991964750 && git push --tags`
