#!/usr/bin/env bash
# MAILPUSH-001 (16.11.2026) — миттєві сигнали Gmail: усе, що треба зробити в Google Cloud, одним сценарієм.
# Запускати в Google Cloud Shell (https://shell.cloud.google.com) у ВАШОМУ обліковому записі Google — НЕ на сервері сайту.
# Сценарій нічого не видаляє і безпечний для повторного запуску (наявне лишає як є або оновлює).
# Nl: één script voor alles in Google Cloud (Pub/Sub-onderwerp, rechten, push-abonnement met OIDC). Uitvoeren in Cloud Shell,
#     niet op de server. Verwijdert niets; opnieuw uitvoeren is veilig.
#
# Використання / gebruik:
#   bash gmail-push-google-cloud.sh <PROJECT_ID> [https://mail.tarasevych.com]
# PROJECT_ID — проєкт, де створено OAuth-клієнт Google, яким сайт підключає Gmail (Console → верхній рядок, «Project ID»).
#
# Наприкінці сценарій друкує три значення. Їх треба внести на сайті: «Сховище ключів» → «Додати», призначення «Google»,
# назви точно такі: GOOGLE_GMAIL_PUBSUB_TOPIC, GOOGLE_GMAIL_PUBSUB_AUDIENCE, GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL.
# Це не секрети (паролів і ключів тут немає). Перезапуск сервера не потрібен: сервер підхоплює їх протягом хвилини.
set -euo pipefail

PROJECT_ID="${1:-}"
SITE="${2:-https://mail.tarasevych.com}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "Вкажіть PROJECT_ID: bash $0 <PROJECT_ID> [https://mail.<ваш-домен>]" >&2
  exit 2
fi
if [[ ! "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "PROJECT_ID має вигляд «my-project-123» (малі літери, цифри, дефіс)." >&2
  exit 2
fi
if [[ ! "$SITE" =~ ^https://[a-z0-9.-]+$ ]]; then
  echo "Адреса сайту має вигляд https://mail.<домен> (без шляху)." >&2
  exit 2
fi

TOPIC=gmail-push
SUB=gmail-push-mijn-ruimte
SA_NAAM=gmail-push-sender
SA="${SA_NAAM}@${PROJECT_ID}.iam.gserviceaccount.com"
ENDPOINT="${SITE}/api/owner/mail/google/pubsub/push"

echo "→ Проєкт: ${PROJECT_ID}"
gcloud config set project "$PROJECT_ID" >/dev/null

echo "→ 1/6 Увімкнути Gmail API і Cloud Pub/Sub API"
gcloud services enable gmail.googleapis.com pubsub.googleapis.com

echo "→ 2/6 Тема Pub/Sub «${TOPIC}»"
gcloud pubsub topics describe "$TOPIC" >/dev/null 2>&1 || gcloud pubsub topics create "$TOPIC"

echo "→ 3/6 Дозволити Gmail публікувати в тему (gmail-api-push@system.gserviceaccount.com → Pub/Sub Publisher)"
gcloud pubsub topics add-iam-policy-binding "$TOPIC" \
  --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" --role="roles/pubsub.publisher" >/dev/null

echo "→ 4/6 Службовий обліковий запис для підпису сигналів «${SA}»"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAAM" --display-name="Mijn Ruimte — Gmail push"

echo "→ 5/6 Дозволити Pub/Sub підписувати сигнали від імені цього облікового запису (Service Account Token Creator)"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator" >/dev/null

echo "→ 6/6 Push-підписка «${SUB}» → ${ENDPOINT} (OIDC, audience = та сама адреса)"
if gcloud pubsub subscriptions describe "$SUB" >/dev/null 2>&1; then
  gcloud pubsub subscriptions update "$SUB" --push-endpoint="$ENDPOINT" \
    --push-auth-service-account="$SA" --push-auth-token-audience="$ENDPOINT" --ack-deadline=30
else
  gcloud pubsub subscriptions create "$SUB" --topic="$TOPIC" --push-endpoint="$ENDPOINT" \
    --push-auth-service-account="$SA" --push-auth-token-audience="$ENDPOINT" --ack-deadline=30 \
    --min-retry-delay=10s --max-retry-delay=600s --message-retention-duration=1d
fi

cat <<KINEC

Готово. Внесіть на сайті три значення («Сховище ключів» → «Додати», призначення «Google»):

  GOOGLE_GMAIL_PUBSUB_TOPIC                  projects/${PROJECT_ID}/topics/${TOPIC}
  GOOGLE_GMAIL_PUBSUB_AUDIENCE               ${ENDPOINT}
  GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL  ${SA}

Що далі (без перезапуску сервера):
  • протягом 5 хвилин сайт сам підпише скриньку на сигнали (завдання «provider.watch.renew», діє 7 днів і оновлюється саме);
  • якщо перед сайтом стоїть Cloudflare з Bot Fight / WAF — дозвольте запити Google на шлях /api/owner/mail/google/pubsub/push
    (правило «Skip»), інакше сигнали не дійдуть;
  • перевірка: надішліть собі лист — він має з’явитися за секунди, а не під час перевірки раз на 15 хвилин.
KINEC
