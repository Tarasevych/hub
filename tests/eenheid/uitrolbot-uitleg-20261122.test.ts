// Перевірка чистих частин бота випусків: пояснення з манифесту та розбір посилання на гілку Telegram.
// Test van de pure delen van de releasebot: uitleg uit het manifest en het ontleden van een Telegram-topiclink.
import { bouwUitgaveUitleg } from '../../backend/uitrol-telegram-uitleg';
import { leesTelegramKoppeling } from '../../src/uitrol/telegram-koppeling';
import type { ReleaseInfo } from '../../backend/uitgave-info';
import type { Manifest } from '../../shared/uitrol-manifest';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => {
  resultaten.push({ naam, ok });
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`);
};

function manifest(versie: string): Manifest {
  return {
    schema: 1,
    versie,
    aangemaakt: '2026-11-22T17:18:40Z',
    herkomst: 'Tarasevych/hub · TEST',
    auteur: 'Павло Тарасевич',
    zonderAi: false,
    deelnemers: [],
    beschrijving: {
      uk: {
        titel: 'Клієнтські картки',
        samenvatting: 'Клієнтські картки, угоди, завдання, контакти та кошториси в особистому просторі.',
        wijzigingen: ['Додано картки клієнтів', 'Додано угоди', 'Додано завдання', 'Зайвий пункт', 'Ще один', 'Понад ліміт'],
        fixes: ['Виправлено дублювання контактів'],
        beperkingen: ['Розгортання потребує погодження власника'],
        instructies: 'Перевірте адресу тунелю та відкрийте сховище ключів.',
      },
      nl: {
        titel: 'Klantdossiers',
        samenvatting: 'Klantdossiers, verkoopkansen, taken, contactgeschiedenis en begrotingen in de eigen ruimte.',
        wijzigingen: ['Klantkaarten toegevoegd', 'Kansen toegevoegd', 'Taken toegevoegd', 'Extra punt', 'Nog een', 'Boven de limiet'],
        fixes: ['Dubbele contacten opgelost'],
        beperkingen: ['Installatie vereist goedkeuring van de eigenaar'],
        instructies: 'Controleer het tunneladres en open de sleutelkluis.',
      },
    },
  };
}

const info: ReleaseInfo = {
  versie: '20261122-171856',
  commit: 'c85e5d73f104f555021c6a896ffecb70256588d3',
  commitStatus: 'git',
  zonderGitReden: null,
  releaseCommit: 'c85e5d73f104f555021c6a896ffecb70256588d3',
  auteur: 'Павло Тарасевич',
  agent: 'codex',
  samenvatting: 'Клієнтські картки, угоди, завдання й кошториси у власному просторі.',
  manifest: manifest('20261122-171856'),
};

export async function main(): Promise<number> {
  const tekst = bouwUitgaveUitleg(info);
  check('пояснення містить обидві мови, назву й підсумок',
    tekst.includes('випуск 20261122-171856') && tekst.includes('🇺🇦') && tekst.includes('🇳🇱')
    && tekst.includes('Клієнтські картки') && tekst.includes('Klantdossiers'));
  check('переліки обмежені п’ятьма пунктами й без шостого',
    tekst.includes('Додано картки клієнтів') && tekst.includes('Ще один') && !tekst.includes('Понад ліміт'));
  check('виправлення, обмеження та інструкції присутні',
    tekst.includes('Виправлено дублювання контактів') && tekst.includes('Розгортання потребує погодження')
    && tekst.includes('Перевірте адресу тунелю'));
  check('посилання на сторінку оновлень і фіксація змін', tekst.includes('/updates') && tekst.includes('c85e5d73f104'));
  check('текст не перевищує ліміт Telegram', tekst.length <= 3900, String(tekst.length));

  check('без манифесту пояснення порожнє', bouwUitgaveUitleg({ ...info, manifest: null }) === '');
  check('без опису українською пояснення порожнє',
    bouwUitgaveUitleg({ ...info, manifest: { ...manifest('x'), beschrijving: {} } as unknown as Manifest }) === '');

  const prive = leesTelegramKoppeling('https://t.me/c/3928298101/1939');
  check('приватна супергрупа: chat_id з -100 і тема з посилання',
    prive?.chatId === '-1003928298101' && prive?.threadId === '1939', JSON.stringify(prive));
  const metBericht = leesTelegramKoppeling('t.me/c/3928298101/1939/1940');
  check('посилання на повідомлення в темі: тема — друге число',
    metBericht?.chatId === '-1003928298101' && metBericht?.threadId === '1939', JSON.stringify(metBericht));
  const openbaar = leesTelegramKoppeling('https://t.me/Mijn_Groep/77');
  check('публічна група: @ім’я і тема', openbaar?.chatId === '@mijn_groep' && openbaar?.threadId === '77', JSON.stringify(openbaar));
  check('без теми тема порожня', leesTelegramKoppeling('https://t.me/mijn_groep')?.threadId === '');
  check('сміття не розпізнається', leesTelegramKoppeling('https://example.com/c/1/2') === null && leesTelegramKoppeling('') === null);

  const mis = resultaten.filter((r) => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (uitrolbot-uitleg-20261122)`);
  return mis ? 1 : 0;
}
