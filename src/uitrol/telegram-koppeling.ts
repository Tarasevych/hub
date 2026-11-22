// Розбір посилання Telegram на гілку (тему) у chat_id і message_thread_id.
// Het ontleden van een Telegram-topiclink naar chat_id en message_thread_id.
//
// Приклади:
//   https://t.me/c/3928298101/1939        → chat_id -1003928298101, тема 1939
//   https://t.me/c/3928298101/1939/1940   → chat_id -1003928298101, тема 1939 (1940 — повідомлення)
//   https://t.me/mijn_groep/1939          → @mijn_groep, тема 1939
//   https://t.me/mijn_groep               → @mijn_groep, без теми

export type TelegramKoppeling = { chatId: string; threadId: string };

export function leesTelegramKoppeling(ruw: string): TelegramKoppeling | null {
  const s = String(ruw || '').trim();
  if (!s) return null;

  // Приватна супергрупа: t.me/c/<внутрішній id>/[тема]/[повідомлення]
  const besloten = /^(?:https?:\/\/)?(?:www\.)?t\.me\/c\/(\d{6,20})(?:\/(\d{1,20}))?(?:\/(\d{1,20}))?\/?$/i.exec(s);
  if (besloten) {
    const intern = besloten[1];
    // Друге число — тема (у форумі) або повідомлення; для гілки беремо саме його.
    const thread = besloten[2] || '';
    return { chatId: `-100${intern}`, threadId: thread };
  }

  // Публічна група або канал: t.me/<ім'я>/[тема]
  const openbaar = /^(?:https?:\/\/)?(?:www\.)?t\.me\/([A-Za-z][A-Za-z0-9_]{3,60})(?:\/(\d{1,20}))?\/?$/i.exec(s);
  if (openbaar) {
    return { chatId: `@${openbaar[1].toLowerCase()}`, threadId: openbaar[2] || '' };
  }

  return null;
}
