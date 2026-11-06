// Teksten (uk + nl) voor de instellingen van logo's en foto's van afzenders (shared/merk-bron.ts, backend/merk-bron.ts).
// Los bestand zonder node-imports: de browser gebruikt het ook.

export const MERK_BRON_TEKST = Object.freeze({
  siteSchakelaar: {
    uk: 'Отримувати логотипи відправників з їхніх доменів (BIMI / значок сайту)',
    nl: 'Logo\'s van afzenders van hun eigen domein halen (BIMI / pictogram van de website)',
  },
  siteUitleg: {
    uk: 'Сервер сайту сам запитує DNS-запис BIMI і значок з офіційного сайту домену відправника (лише https, лише публічні адреси, до 256 КБ) і зберігає логотип у базі сайту на 30 днів. Ваш браузер нічого не завантажує ззовні. Приватність: власник домену бачить IP-адресу вашого сервера (не вашу і не адресу листа) — так само, як коли хтось відкриває його сайт.',
    nl: 'De server van de site vraagt zelf het BIMI-record in de DNS en het pictogram van de officiële website van het domein van de afzender op (alleen https, alleen publieke adressen, tot 256 KB) en bewaart het logo 30 dagen in de database van de site. Uw browser laadt niets van buiten. Privacy: de eigenaar van het domein ziet het IP-adres van uw server (niet het uwe en niet het adres van de mail) — net als wanneer iemand zijn website opent.',
  },
  gravatar: {
    uk: 'Шукати фото відправників у Gravatar',
    nl: 'Foto\'s van afzenders zoeken bij Gravatar',
  },
  gravatarUitleg: {
    uk: 'Вимкнено типово. Якщо увімкнути, сервер надсилає до Gravatar (Automattic) SHA-256 від адреси кожного відправника, якого ви бачите у списку, — Gravatar дізнається, що ваш сервер шукав цю адресу.',
    nl: 'Standaard uit. Zet u dit aan, dan stuurt de server de SHA-256 van het adres van elke afzender die u in de lijst ziet naar Gravatar (Automattic) — Gravatar ziet dan dat uw server dat adres zocht.',
  },
  google: {
    uk: 'Фото відправників з ваших Google-контактів',
    nl: 'Foto\'s van afzenders uit uw Google-contacten',
  },
  googleUitleg: {
    uk: 'Сервер читає лише адреси й фото з «Контактів» та «Інших контактів» Google (People API, тільки читання) і зберігає фото лише тих відправників, яких ви бачите у пошті. Стандартні літерні заглушки Google не беруться. Потрібен додатковий дозвіл Google — кнопка нижче відкриє вікно Google.',
    nl: 'De server leest alleen adressen en foto\'s uit «Contacten» en «Andere contacten» van Google (People API, alleen lezen) en bewaart alleen foto\'s van afzenders die u in de mail ziet. De standaard letterplaatjes van Google worden niet gebruikt. Een extra Google-toestemming is nodig — de knop hieronder opent het venster van Google.',
  },
});
