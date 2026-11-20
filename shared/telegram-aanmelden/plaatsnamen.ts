// TELEGRAM-002 — plaatsnamen voor mensen, zonder Engelse woorden (eis van de eigenaar 14.11.2026).
// Cloudflare levert de stad in het Engels («Brussels», «Kyiv»). We tonen daarom:
//   • het LAND altijd in de taal van de lezer (Intl.DisplayNames: «Бельгія» / «België»);
//   • de STAD alleen als die in deze lijst staat (uk + nl); een onbekende stad laten we weg in plaats van een Engels woord te tonen.
// Українською: країна завжди мовою читача; місто — лише якщо є в цьому словнику, інакше не показуємо англійську назву.
type Naam = { uk: string; nl: string };

const STEDEN: Record<string, Naam> = {
  // België / Бельгія
  brussels: { uk: 'Брюссель', nl: 'Brussel' }, antwerp: { uk: 'Антверпен', nl: 'Antwerpen' }, ghent: { uk: 'Гент', nl: 'Gent' },
  bruges: { uk: 'Брюгге', nl: 'Brugge' }, leuven: { uk: 'Левен', nl: 'Leuven' }, mechelen: { uk: 'Мехелен', nl: 'Mechelen' },
  liege: { uk: 'Льєж', nl: 'Luik' }, charleroi: { uk: 'Шарлеруа', nl: 'Charleroi' }, namur: { uk: 'Намюр', nl: 'Namen' },
  hasselt: { uk: 'Гасселт', nl: 'Hasselt' }, kortrijk: { uk: 'Кортрейк', nl: 'Kortrijk' }, ostend: { uk: 'Остенде', nl: 'Oostende' },
  aalst: { uk: 'Алст', nl: 'Aalst' }, genk: { uk: 'Генк', nl: 'Genk' }, mons: { uk: 'Монс', nl: 'Bergen' },
  zaventem: { uk: 'Завентем', nl: 'Zaventem' }, 'sint-niklaas': { uk: 'Сінт-Ніклас', nl: 'Sint-Niklaas' },
  // Nederland / Нідерланди
  amsterdam: { uk: 'Амстердам', nl: 'Amsterdam' }, rotterdam: { uk: 'Роттердам', nl: 'Rotterdam' }, 'the hague': { uk: 'Гаага', nl: 'Den Haag' },
  utrecht: { uk: 'Утрехт', nl: 'Utrecht' }, eindhoven: { uk: 'Ейндговен', nl: 'Eindhoven' }, maastricht: { uk: 'Маастрихт', nl: 'Maastricht' },
  breda: { uk: 'Бреда', nl: 'Breda' }, groningen: { uk: 'Гронінген', nl: 'Groningen' },
  // Україна
  kyiv: { uk: 'Київ', nl: 'Kyiv' }, kiev: { uk: 'Київ', nl: 'Kyiv' }, lviv: { uk: 'Львів', nl: 'Lviv' }, kharkiv: { uk: 'Харків', nl: 'Charkiv' },
  odesa: { uk: 'Одеса', nl: 'Odesa' }, odessa: { uk: 'Одеса', nl: 'Odesa' }, dnipro: { uk: 'Дніпро', nl: 'Dnipro' },
  zaporizhzhia: { uk: 'Запоріжжя', nl: 'Zaporizja' }, vinnytsia: { uk: 'Вінниця', nl: 'Vinnytsja' }, poltava: { uk: 'Полтава', nl: 'Poltava' },
  chernihiv: { uk: 'Чернігів', nl: 'Tsjernihiv' }, cherkasy: { uk: 'Черкаси', nl: 'Tsjerkasy' }, zhytomyr: { uk: 'Житомир', nl: 'Zjytomyr' },
  rivne: { uk: 'Рівне', nl: 'Rivne' }, lutsk: { uk: 'Луцьк', nl: 'Loetsk' }, ternopil: { uk: 'Тернопіль', nl: 'Ternopil' },
  'ivano-frankivsk': { uk: 'Івано-Франківськ', nl: 'Ivano-Frankivsk' }, uzhhorod: { uk: 'Ужгород', nl: 'Oezjhorod' },
  chernivtsi: { uk: 'Чернівці', nl: 'Tsjernivtsi' }, khmelnytskyi: { uk: 'Хмельницький', nl: 'Chmelnytsky' }, sumy: { uk: 'Суми', nl: 'Soemy' },
  mykolaiv: { uk: 'Миколаїв', nl: 'Mykolajiv' }, kherson: { uk: 'Херсон', nl: 'Cherson' }, kropyvnytskyi: { uk: 'Кропивницький', nl: 'Kropyvnytsky' },
  // Buren en grote steden / Сусіди й великі міста
  paris: { uk: 'Париж', nl: 'Parijs' }, lille: { uk: 'Лілль', nl: 'Rijsel' }, luxembourg: { uk: 'Люксембург', nl: 'Luxemburg' },
  cologne: { uk: 'Кельн', nl: 'Keulen' }, aachen: { uk: 'Ахен', nl: 'Aken' }, dusseldorf: { uk: 'Дюссельдорф', nl: 'Düsseldorf' },
  frankfurt: { uk: 'Франкфурт', nl: 'Frankfurt' }, 'frankfurt am main': { uk: 'Франкфурт', nl: 'Frankfurt' }, berlin: { uk: 'Берлін', nl: 'Berlijn' },
  munich: { uk: 'Мюнхен', nl: 'München' }, hamburg: { uk: 'Гамбург', nl: 'Hamburg' }, london: { uk: 'Лондон', nl: 'Londen' },
  warsaw: { uk: 'Варшава', nl: 'Warschau' }, krakow: { uk: 'Краків', nl: 'Krakau' }, wroclaw: { uk: 'Вроцлав', nl: 'Wrocław' },
  prague: { uk: 'Прага', nl: 'Praag' }, vienna: { uk: 'Відень', nl: 'Wenen' }, rome: { uk: 'Рим', nl: 'Rome' }, milan: { uk: 'Мілан', nl: 'Milaan' },
  madrid: { uk: 'Мадрид', nl: 'Madrid' }, barcelona: { uk: 'Барселона', nl: 'Barcelona' }, lisbon: { uk: 'Лісабон', nl: 'Lissabon' },
  dublin: { uk: 'Дублін', nl: 'Dublin' }, stockholm: { uk: 'Стокгольм', nl: 'Stockholm' }, copenhagen: { uk: 'Копенгаген', nl: 'Kopenhagen' },
  helsinki: { uk: 'Гельсінкі', nl: 'Helsinki' }, oslo: { uk: 'Осло', nl: 'Oslo' }, zurich: { uk: 'Цюрих', nl: 'Zürich' }, geneva: { uk: 'Женева', nl: 'Genève' },
  bucharest: { uk: 'Бухарест', nl: 'Boekarest' }, chisinau: { uk: 'Кишинів', nl: 'Chisinau' }, vilnius: { uk: 'Вільнюс', nl: 'Vilnius' },
  riga: { uk: 'Рига', nl: 'Riga' }, tallinn: { uk: 'Таллінн', nl: 'Tallinn' }, budapest: { uk: 'Будапешт', nl: 'Boedapest' },
  bratislava: { uk: 'Братислава', nl: 'Bratislava' }, 'new york': { uk: 'Нью-Йорк', nl: 'New York' }, ashburn: { uk: 'Ешберн', nl: 'Ashburn' },
};

const sleutel = (v: string): string => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Naam van een stad uit de lijst (sleutel zoals in STEDEN), of ''. */
export const stadNaam = (stadSleutel: string, taal: 'uk' | 'nl'): string => STEDEN[sleutel(stadSleutel)]?.[taal] || '';

/** Naam van een land in de taal van de lezer, of '' als onbekend. */
export function landNaam(land: string, taal: 'uk' | 'nl'): string {
  if (!/^[A-Z]{2}$/.test(land)) return '';
  try { const n = new Intl.DisplayNames([taal], { type: 'region' }).of(land); return n && n !== land ? n : ''; } catch { return ''; }
}

/** «Брюссель, Бельгія» / «Brussel, België»; onbekende stad → alleen het land; niets bekend → ''. */
export function plaatsTekst(plaats: string, land: string, taal: 'uk' | 'nl'): string {
  const stad = STEDEN[sleutel(String(plaats || '').split(',')[0] || '')];
  return [stad?.[taal] || '', landNaam(land, taal)].filter(Boolean).join(', ');
}
