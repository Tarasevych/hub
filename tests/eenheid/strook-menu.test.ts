// Snelmenu en instellingenpaneel van de technische strook (eigenaar 03.11.2026): «Правий клік на кнопці відкриває підменю з
// додатковими опціями цієї кнопки», «Розмір і вигляд кнопок: лише піктограми / піктограми з написами / лише написи», «Кнопки можна
// переставляти в довільному порядку», «Вигляд має відповідати стилю вікон сайту». Zuiver model (strook-menu.ts) + weergave met
// react-dom/server (de *Inhoud-delen van StrookPaneel.tsx, zonder portaal). Geen database, geen netwerk.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { groepeer, knopMenu, type KnopMenuContext } from '../../src/tech/strook-menu';
import { nepBrowser } from './hulp/nep-browser';
import { normaliseer } from '../../src/tech/strook-voorkeur';

export async function main(): Promise<number> {
  const { check, einde } = checker('strook-menu');
  // StrookPaneel laadt via HulpVraag → Vraag → tech-opslag → src/canoniek-dienst.ts, dat zijn runtime bij het importeren uit `window`
  // leest: eerst de nepbrowser (tests/eenheid/hulp/nep-browser.ts), dan pas de module laden (niet bovenaan importeren).
  nepBrowser();
  const { StrookInstelInhoud, StrookKnopMenuInhoud } = await import('../../src/tech/StrookPaneel');
  const log: string[] = [];
  const ctx = (o: Partial<KnopMenuContext>): KnopMenuContext => ({
    uk: true, id: 'beheer', naam: 'Адміністрування', plek: 1, aantal: 4, kiesbaar: true, modus: 'auto', label: 'beide',
    acties: {
      naarPlek: (p) => log.push(`plek ${p}`), wegVanStrook: () => log.push('weg'), opStrook: () => log.push('op'), zetModus: (m) => log.push(`modus ${m}`),
      zetLabel: (l) => log.push(`label ${l}`), instellingen: () => log.push('instel'), nieuwTabblad: (u) => log.push(`tab ${u}`), kopieer: (u) => log.push(`kopie ${u}`), standaard: () => log.push('standaard'),
    },
    ...o,
  });
  const vind = (items: ReturnType<typeof knopMenu>, label: string) => items.find((x) => x.label === label);

  // ---------------------------------------------------------------- 1. eigen opties per knop
  {
    const items = knopMenu(ctx({ open: () => log.push('open'), url: 'https://admin.example.test/uk/overview' }));
    const koppen = groepeer(items).map((g) => g.kop);
    check('navigatieknop: eerst de eigen opties (Відкрити, нова вкладка, посилання), dan plaats, vorm, smuga', koppen.join('|') === 'Адміністрування|Розташування|Вигляд кнопок|Смуга' && items[0].label === 'Відкрити' && items[1].label === 'Відкрити в новій вкладці' && items[2].label === 'Копіювати посилання');
    log.length = 0;
    vind(items, 'Відкрити')!.onKies(); vind(items, 'Відкрити в новій вкладці')!.onKies(); vind(items, 'Копіювати посилання')!.onKies();
    check('… en ze doen wat ze zeggen', log.join(';') === 'open;tab https://admin.example.test/uk/overview;kopie https://admin.example.test/uk/overview', log.join(';'));
    log.length = 0;
    vind(items, 'Ліворуч')!.onKies(); vind(items, 'Праворуч')!.onKies(); vind(items, 'На початок смуги')!.onKies(); vind(items, 'У кінець смуги')!.onKies(); vind(items, 'Прибрати зі смуги')!.onKies();
    check('plaats: ліворуч/праворуч/на початок/у кінець/прибрати', log.join(';') === 'plek 0;plek 2;plek 0;plek 3;weg', log.join(';'));
    const vorm = items.filter((x) => x.groep === 'Вигляд кнопок');
    check('vorm van de knoppen: drie keuzes in de woorden van de eigenaar, de huidige aangevinkt', vorm.map((x) => x.label).join('|') === 'Лише піктограми|Піктограми з написами|Лише написи' && vorm.filter((x) => x.gekozen).map((x) => x.label).join() === 'Піктограми з написами');
    log.length = 0; vorm[0].onKies();
    check('… kiezen zet de vorm voor de hele strook', log.join() === 'label iconen');
  }
  {
    const eerste = knopMenu(ctx({ plek: 0 })), laatste = knopMenu(ctx({ plek: 3 }));
    check('eerste knop: «Ліворуч» en «На початок» uit; laatste: «Праворуч» en «У кінець» uit', !!vind(eerste, 'Ліворуч')!.disabled && !!vind(eerste, 'На початок смуги')!.disabled && !vind(eerste, 'Праворуч')!.disabled && !!vind(laatste, 'Праворуч')!.disabled && !!vind(laatste, 'У кінець смуги')!.disabled);
    const ernaast = knopMenu(ctx({ plek: -1 }));
    check('knop uit de lijst «⋯» die niet op de strook staat: «Додати на смугу»', !!vind(ernaast, 'Додати на смугу') && !vind(ernaast, 'Ліворуч'));
    const modus = knopMenu(ctx({ id: 'modus', naam: 'Згорнути смугу', kiesbaar: false, plek: -1, modus: 'ingeklapt' }));
    const modi = modus.filter((x) => x.groep === 'Режим смуги');
    check('modusknop: розгорнуто / згорнуто / автоматично, de huidige aangevinkt; niet verplaatsbaar', modi.map((x) => x.label).join('|') === 'Розгорнуто|Згорнуто|Автоматично' && modi.find((x) => x.gekozen)?.label === 'Згорнуто' && !modus.some((x) => x.groep === 'Розташування'));
    log.length = 0; modi[2].onKies();
    check('… kiezen zet de modus', log.join() === 'modus auto');
    const extra = knopMenu(ctx({ id: 'uit', naam: 'Вийти…', extra: [{ label: 'Вийти…', onKies: () => log.push('uitloggen') }, { label: 'Змінити термін', onKies: () => log.push('termijn') }] }));
    check('eigen opties van een knop (afmelden, termijn) staan bovenaan onder zijn naam', extra[0].groep === 'Вийти…' && extra[0].label === 'Вийти…' && extra[1].label === 'Змінити термін');
    const instel = knopMenu(ctx({ id: 'instel', naam: 'Налаштування смуги', kiesbaar: false, plek: -1, open: () => log.push('instel-open') }));
    check('instellingenknop: ook «Типові налаштування»', !!vind(instel, 'Типові налаштування') && !!vind(instel, 'Налаштування смуги…'));
    const nl = knopMenu(ctx({ uk: false, naam: 'Beheer', url: 'https://x.test', open: () => undefined }));
    check('Nederlands: eigen woorden, geen Oekraïens', nl.map((x) => x.label).join('|').includes('Openen in een nieuw tabblad') && nl.some((x) => x.label === 'Alleen pictogrammen') && !/[А-Яа-яІіЇїЄєҐґ]/.test(nl.map((x) => `${x.label}${x.groep}`).join('')));
  }
  check('groepeer: opeenvolgende koppen samen, volgorde blijft', JSON.stringify(groepeer([{ label: 'a', groep: 'x', onKies: () => undefined }, { label: 'b', groep: 'x', onKies: () => undefined }, { label: 'c', groep: 'y', onKies: () => undefined }]).map((g) => [g.kop, g.items.map((i) => i.label).join('')])) === '[["x","ab"],["y","c"]]');

  // ---------------------------------------------------------------- 2. weergave (react-dom/server)
  {
    const items = knopMenu(ctx({ open: () => undefined }));
    const html = renderToStaticMarkup(createElement(StrookKnopMenuInhoud, { items, onSluit: () => undefined }));
    check('snelmenu: blokken als role=group met kop, keuzes als menuitemradio met aria-checked', (html.match(/role="group"/g) || []).length === 4 && /role="menuitemradio" aria-checked="true"[^>]*class="is-gekozen"/.test(html) && /role="menuitem"/.test(html) && html.includes('tech-strook-menu-kop'));
    check('snelmenu: uitgeschakelde opdracht is disabled', /<button[^>]*disabled=""[^>]*>[^<]*<span[^>]*><\/span>Ліворуч|<button[^>]*disabled=""[^>]*><span class="tech-strook-menu-vink"[^>]*><\/span>(Ліворуч|На початок смуги)/.test(renderToStaticMarkup(createElement(StrookKnopMenuInhoud, { items: knopMenu(ctx({ plek: 0 })), onSluit: () => undefined }))));
  }
  {
    const v = normaliseer({ modus: 'auto', knoppen: ['meldingen', 'uit'] });
    const uk = renderToStaticMarkup(createElement(StrookInstelInhoud, { uk: true, voorkeur: v, onWijzig: () => undefined, onSluit: () => undefined }));
    const nl = renderToStaticMarkup(createElement(StrookInstelInhoud, { uk: false, voorkeur: v, onWijzig: () => undefined, onSluit: () => undefined }));
    check('paneel uk: modi, grootte en vorm (woorden van de eigenaar), uitleg bij de modus', ['Розгорнуто', 'Згорнуто', 'Автоматично', 'Малі', 'Лише піктограми', 'Піктограми з написами', 'Лише написи', 'розгортається, коли наводите'].every((w) => uk.includes(w)));
    check('paneel: kop zoals een venster (titel + sluitknop), radiogroepen met aria-checked', uk.includes('class="tech-strook-kop"') && uk.includes('tech-strook-titel') && uk.includes('aria-label="Закрити"') && (uk.match(/role="radiogroup"/g) || []).length === 3 && /role="radio"[^>]*aria-checked="true"[^>]*>Автоматично/.test(uk));
    check('paneel: elke rij sleepbaar met een greep, ↑/↓ en een vinkje; zichtbare knoppen eerst', (uk.match(/draggable="true"/g) || []).length >= 10 && uk.includes('tech-strook-greep') && /data-strook-rij="meldingen"[\s\S]*data-strook-rij="uit"[\s\S]*data-strook-rij="wissel"/.test(uk));
    check('paneel nl: geen Oekraïense of Engelse woorden in de tekst', !/[А-Яа-яІіЇїЄєҐґ]/.test(nl.replace(/<[^>]+>/g, '')) && !/\b(Settings|Close|Mode|Size|Reset|Buttons)\b/.test(nl.replace(/<[^>]+>/g, ' ')) && nl.includes('Alleen pictogrammen') && nl.includes('Standaard herstellen'));
  }

  // ---------------------------------------------------------------- 3. bron: CSP en stijl van de vensters
  {
    const paneel = readFileSync('src/tech/StrookPaneel.tsx', 'utf8'), laag = readFileSync('src/tech/TechLaag.tsx', 'utf8'), css = readFileSync('src/tech/strook.css', 'utf8');
    check('CSP style-src self: geen <style> in de strook (alleen .css en inline style={…})', !/<style[\s>]/.test(paneel + laag));
    check('stijl van de vensters: paneel 16 px rond met kop var(--surface) en sluitknop 40×40, focusring var(--venster-actief)', /\.tech-strook-paneel\{[^}]*border-radius:16px/.test(css) && /\.tech-strook-kop\{[^}]*background:var\(--surface/.test(css) && /\.tech-strook-sluit\{[^}]*width:40px;height:40px/.test(css) && css.includes('var(--venster-actief'));
    check('knoppen op de volle band: eigen vlak (var(--surface)) en rand (var(--line)) met tussenruimte — niet meer in de bandkleur', /\.tech-band-knoppen>\.tech-strook-item>button,[\s\S]*?border:1px solid var\(--line[^;]*;border-radius:9px;background:var\(--surface/.test(css) && /\.tech-band \.tech-band-knoppen\{gap:6px/.test(css));
    check('aanwijzen: knop vergroot en naam als tekstwolkje (display:none tot aanwijzen — raakt de meting niet)', /\.tech-strook-item:hover,[\s\S]*?\{transform:scale\(1\.1\)/.test(css) && /\.tech-band \.tech-strook-item::after\{content:attr\(data-label\)[^}]*display:none/.test(css));
    check('te smal: knoppen verhuizen één voor één naar «⋯» (data-overvol), «Вийти» als laatste', /\[data-overvol\]\{display:none!important\}/.test(css) && /OVERLOOP_PRIO[^\n]*uit: 3/.test(laag) && /it\.dataset\.overvol = '1'/.test(laag));
    check('rechtsklik op elke knop van de strook, ook de vaste en die in «⋯»', (laag.match(/onContextMenu=\{/g) || []).length >= 3 && /menuVoor\(strookMenu\.id\)/.test(laag));
    check('slepen op de strook zelf (draggable + dropPlek + zetOp)', /draggable=\{volledig\}/.test(laag) && /dropPlek\(voorkeur\.knoppen, sleep, id, doel\.na\)/.test(laag));
  }
  return einde();
}
