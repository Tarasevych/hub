// Stand (24.10.2026, één update): de globale zoekknop op de POST staat in het MENU en niet meer boven het accountmenu van de post.
//   mail-zoek-in-menu   — telefoon (≤ 700 px): geen ronde knop rechtsboven; het Gmail-avatar (accountmenu van de post) en zijn logo zijn
//                         zelf aanklikbaar (elementFromPoint); in de lade staat de zoekknop TUSSEN de profielfoto en «Редагувати меню»
//                         (zelfde rij, 44×44, niet bedekt); tik → de lade sluit, het palet opent met de focus in het veld; Escape →
//                         palet dicht, focus op de menuknop die de lade opent.
//                         computer: geen veld naast de profielfoto; «Оновити пошту» en «Швидкі налаштування» liggen vrij; de zoekknop staat
//                         in de werkbalk van de zijbalk (breed: vlak vóór «Налаштувати меню»; smal: onder de modusknop); klik → palet,
//                         Escape → focus terug op die knop; Ctrl+K werkt nog.
//   hub-zoek-ongewijzigd — controle: op de hub blijft alles zoals het was (veld naast de foto / ronde knop; geen zoekknop in het menu).
import { join } from 'node:path';

type Page = import('playwright-core').Page;
export type ZoekMenuCtx = { uit: string; zeg: (s: string) => void; meting: (naam: string, p: Page, slecht: string, detail: string) => void };

type Doos = { x: number; y: number; w: number; h: number } | null;
const actief = (p: Page) => p.evaluate(() => { const a = document.activeElement as HTMLElement | null; if (!a || a === document.body) return 'body'; return `${a.tagName.toLowerCase()}${a.getAttribute('data-sidebar-action') ? `[data-sidebar-action=${a.getAttribute('data-sidebar-action')}]` : ''}${a.getAttribute('data-zoek-trigger') ? `[data-zoek-trigger=${a.getAttribute('data-zoek-trigger')}]` : ''}${a.closest('[data-zoek-palet]') ? ' (in palet)' : ''}`; });

export const zoekMenuMail = (c: ZoekMenuCtx) => async (p: Page) => {
  const w = p.viewportSize()?.width || 0, telefoon = w <= 700, slecht: string[] = [];
  await p.waitForSelector('.mail-top-command-bar', { timeout: 20000 });
  // muis uit de zijbalk (een open hover-lade legt terecht een scherm over de pagina) en wachten tot hij weer smal is
  const hgt = p.viewportSize()?.height || 800;
  await p.mouse.move(Math.round(w * 0.62), Math.round(hgt * 0.55));
  await p.waitForFunction(() => document.querySelector('main.canonical-chrome')?.getAttribute('data-sidebar-state') !== 'hover-expanded', undefined, { timeout: 4000 }).catch(() => undefined);
  await p.waitForTimeout(900);
  const boven = await p.evaluate(() => {
    const r = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return null; return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
    const op = (e: Element | null) => { if (!e) return 'geen'; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return 'onzichtbaar'; const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (!t) return 'niets'; if (t === e || e.contains(t)) return 'zelf'; const k = t.getAttribute('class') || ''; return `${t.tagName.toLowerCase()}.${k.slice(0, 70)}`; };
    const anker = document.querySelector('.canonical-account-anchor'), badge = document.querySelector('.mail-account-badge-trigger'), logo = document.querySelector('.mail-account-badge-logo');
    return {
      rond: document.querySelectorAll('.zk-trigger-mobiel').length, veld: document.querySelectorAll('.zk-trigger').length,
      veldInAnker: anker ? anker.querySelectorAll('.zk-trigger').length : -1, avatarInAnker: !!anker?.querySelector('.canonical-avatar-trigger'),
      badge: r(badge), badgeOp: op(badge), logoOp: op(logo), vernieuw: r(document.querySelector('.mail-top-refresh')), vernieuwOp: op(document.querySelector('.mail-top-refresh')),
      instellingenOp: op(document.querySelector('.mail-top-settings')), stand: document.querySelector('main.canonical-chrome')?.getAttribute('data-sidebar-state') || '',
      menuKnoppen: document.querySelectorAll('[data-zoek-trigger="menu"]').length,
    };
  });
  if (boven.rond) slecht.push(`ronde zoekknop nog in de bovenbalk (${boven.rond})`);
  if (boven.veldInAnker > 0) slecht.push('veld «Пошук у «Мій простір»» nog naast de profielfoto');
  if (boven.vernieuwOp !== 'zelf') slecht.push(`«Оновити пошту» bedekt: ${boven.vernieuwOp}`);
  if (boven.instellingenOp !== 'zelf') slecht.push(`«Швидкі налаштування» bedekt: ${boven.instellingenOp}`);
  if (boven.badge && boven.badgeOp !== 'zelf') slecht.push(`accountmenu van de post (avatar) bedekt: ${boven.badgeOp}`);
  if (boven.badge && boven.logoOp !== 'zelf') slecht.push(`logo op het avatar bedekt: ${boven.logoOp}`);
  if (telefoon && !boven.badge) slecht.push('accountmenu van de post (avatar) niet zichtbaar op de telefoon');
  let detail: Record<string, unknown> = { boven };

  if (telefoon) {
    await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-bovenbalk-${w}.png`), clip: { x: 0, y: 0, width: w, height: 64 } }).catch(() => undefined);
    await p.locator('[data-sidebar-action="open-drawer"]').first().click({ timeout: 10000 });
    await p.waitForSelector('.canonical-drawer-header [data-zoek-trigger="menu"]', { timeout: 6000 }).catch(() => undefined);
    await p.waitForTimeout(450); // lade-animatie
    const lade = await p.evaluate(() => {
      const r = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return null; return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      const op = (e: Element | null) => { if (!e) return 'geen'; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return 'onzichtbaar'; const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (!t) return 'niets'; if (t === e || e.contains(t)) return 'zelf'; const k = t.getAttribute('class') || ''; return `${t.tagName.toLowerCase()}.${k.slice(0, 70)}`; };
      const kop = document.querySelector('.canonical-drawer-header');
      const foto = kop?.querySelector('.canonical-drawer-account') || null, zoek = kop?.querySelector('[data-zoek-trigger="menu"]') || null, bewerk = kop?.querySelector('.menu-lade-bewerken') || null, sluit = kop?.querySelector('.canonical-drawer-close') || null;
      return { kinderen: kop ? [...kop.children].map((k) => (k.getAttribute('data-zoek-trigger') ? 'zoek' : /* 25.10.2026: foto + gniezda (bel) staan samen in de zone «kop van het menu» */ k.classList.contains('plaats-lade-kop') && k.querySelector('.canonical-drawer-account') ? 'canonical-drawer-account' : String(k.className).split(' ').find((x) => /drawer-account|menu-lade-bewerken|drawer-close/.test(x)) || k.tagName)) : [], foto: r(foto), zoek: r(zoek), bewerk: r(bewerk), sluit: r(sluit), zoekOp: op(zoek), label: zoek?.getAttribute('aria-label') || '', kleur: zoek ? getComputedStyle(zoek).color : '', achtergrond: zoek ? getComputedStyle(zoek).backgroundColor : '' };
    });
    detail = { ...detail, lade };
    const { foto, zoek, bewerk, sluit } = lade;
    if (!zoek) slecht.push(`geen zoekknop in de lade (kop: ${lade.kinderen.join(' ')})`);
    else {
      if (!foto || !bewerk || !(foto.x + foto.w <= zoek.x && zoek.x + zoek.w <= bewerk.x)) slecht.push(`zoekknop niet tussen profielfoto en «Редагувати меню»: foto ${JSON.stringify(foto)} zoek ${JSON.stringify(zoek)} bewerk ${JSON.stringify(bewerk)}`);
      if (sluit && bewerk && bewerk.x + bewerk.w > sluit.x + 1) slecht.push('«Редагувати меню» schuift onder «Закрити»');
      const mid = (d: Doos) => (d ? d.y + d.h / 2 : 0);
      if (foto && bewerk && (Math.abs(mid(zoek) - mid(foto)) > 4 || Math.abs(mid(zoek) - mid(bewerk)) > 4)) slecht.push('zoekknop niet op dezelfde rij als foto en bewerkknop');
      if (zoek.w < 44 || zoek.h < 44) slecht.push(`zoekknop kleiner dan 44×44: ${zoek.w}×${zoek.h}`);
      if (lade.zoekOp !== 'zelf') slecht.push(`zoekknop in de lade bedekt: ${lade.zoekOp}`);
      if (lade.label !== 'Пошук у «Мій простір»' && lade.label !== 'Zoeken in «Mijn Ruimte»') slecht.push(`aria-label: ${lade.label}`);
      if (lade.kinderen.join(' ') !== 'canonical-drawer-account zoek menu-lade-bewerken canonical-drawer-close') slecht.push(`volgorde in de kop: ${lade.kinderen.join(' ')}`);
    }
    const kopDoos = await p.locator('.canonical-drawer-header').boundingBox().catch(() => null);
    if (kopDoos) {
      const clip = { x: Math.max(0, kopDoos.x - 8), y: Math.max(0, kopDoos.y - 8), width: Math.min(w, kopDoos.width + 16), height: kopDoos.height + 16 };
      await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-lade-${w}.png`), clip }).catch(() => undefined);
      await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(350);
      await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-lade-${w}-donker.png`), clip }).catch(() => undefined);
      await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(250);
    }
    if (zoek) {
      await p.locator('.canonical-drawer-header [data-zoek-trigger="menu"]').click();
      await p.waitForSelector('[data-zoek-palet="open"]', { timeout: 5000 }).catch(() => undefined);
      await p.waitForTimeout(300);
      const na = await p.evaluate(() => ({ palet: !!document.querySelector('[data-zoek-palet="open"]'), lade: document.querySelectorAll('.canonical-drawer-header').length, stand: document.querySelector('main.canonical-chrome')?.getAttribute('data-sidebar-state') || '' }));
      const f1 = await actief(p);
      await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-palet-${w}.png`) }).catch(() => undefined);
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      const dicht = !(await p.locator('[data-zoek-palet="open"]').count()), f2 = await actief(p);
      detail = { ...detail, naTik: na, focusInPalet: f1, focusNaEscape: f2, dicht };
      if (!na.palet) slecht.push('palet opent niet vanuit de lade');
      if (na.lade || na.stand === 'drawer') slecht.push('lade blijft open onder het palet');
      if (!/input.*\(in palet\)/.test(f1)) slecht.push(`focus niet in het zoekveld: ${f1}`);
      if (!dicht) slecht.push('Escape sluit het palet niet');
      if (!/data-sidebar-action=open-drawer/.test(f2)) slecht.push(`focus na Escape niet op de menuknop: ${f2}`);
    }
  } else {
    const zij = await p.evaluate(() => {
      const r = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return null; return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      const op = (e: Element | null) => { if (!e) return 'geen'; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return 'onzichtbaar'; const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); if (!t) return 'niets'; if (t === e || e.contains(t)) return 'zelf'; const k = t.getAttribute('class') || ''; return `${t.tagName.toLowerCase()}.${k.slice(0, 70)}`; };
      const knop = document.querySelector('.zijbalk-werkbalk [data-zoek-trigger="menu"]');
      return { knop: r(knop), knopOp: op(knop), venster: r(document.querySelector('.zijbalk-werkbalk [data-menu-venster-knop]')), modus: r(document.querySelector('.zijbalk-werkbalk .zijbalk-modus-huidig')), klasse: knop?.className || '', label: knop?.getAttribute('aria-label') || '', tooltip: knop?.getAttribute('data-tooltip') || '' };
    });
    detail = { ...detail, zij };
    if (!zij.knop) slecht.push('geen zoekknop in de werkbalk van de zijbalk');
    else {
      if (zij.knopOp !== 'zelf') slecht.push(`zoekknop in de zijbalk bedekt: ${zij.knopOp}`);
      if (zij.venster && !(zij.knop.x + zij.knop.w <= zij.venster.x)) slecht.push('zoekknop niet vóór «Налаштувати меню»');
      if (!zij.venster && zij.modus && zij.knop.y < zij.modus.y + zij.modus.h) slecht.push('smal: zoekknop niet onder de modusknop');
      if (!/Ctrl K|⌘K/.test(zij.label)) slecht.push(`label zonder sneltoets: ${zij.label}`);
    }
    const doos = await p.locator('.zijbalk-werkbalk').first().boundingBox().catch(() => null);
    if (doos) await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-werkbalk-${w}.png`), clip: { x: Math.max(0, doos.x - 6), y: Math.max(0, doos.y - 6), width: Math.min(w, doos.width + 12), height: doos.height + 12 } }).catch(() => undefined);
    const kopDoos = await p.locator('.mail-top-command-bar').boundingBox().catch(() => null);
    if (kopDoos) await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-bovenbalk-${w}.png`), clip: { x: 0, y: 0, width: w, height: Math.min(140, kopDoos.y + kopDoos.height + 16) } }).catch(() => undefined);
    // breed (aanwijzen: auto-modus klapt open): zoekknop direct links van de pil met «Налаштувати меню», op dezelfde hoogte
    await p.mouse.move(28, Math.round(hgt * 0.5)); await p.waitForSelector('.zijbalk-werkbalk.breed', { timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(500);
    const breed = await p.evaluate(() => {
      const r = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); if (!b.width || !b.height) return null; return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
      return { knop: r(document.querySelector('.zijbalk-werkbalk.breed [data-zoek-trigger="menu"]')), pil: r(document.querySelector('.zijbalk-werkbalk.breed .zijbalk-werkbalk-knoppen')), titel: r(document.querySelector('.zijbalk-werkbalk.breed .zijbalk-werkbalk-titel')), werkbalk: r(document.querySelector('.zijbalk-werkbalk.breed')) };
    });
    detail = { ...detail, breed };
    if (!breed.knop || !breed.pil) slecht.push('breed: geen zoekknop of pil');
    else {
      const gat = breed.pil.x - (breed.knop.x + breed.knop.w);
      if (gat < 0 || gat > 12) slecht.push(`breed: zoekknop niet direct links van de pil (gat ${gat} px)`);
      if (Math.abs((breed.knop.y + breed.knop.h / 2) - (breed.pil.y + breed.pil.h / 2)) > 2) slecht.push('breed: zoekknop niet op de hoogte van de pil');
      if (breed.titel && breed.titel.x >= breed.knop.x) slecht.push('breed: titel «Меню» niet links');
    }
    if (breed.werkbalk) {
      const clip = { x: Math.max(0, breed.werkbalk.x - 6), y: Math.max(0, breed.werkbalk.y - 6), width: breed.werkbalk.w + 12, height: breed.werkbalk.h + 12 };
      await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-werkbalk-breed-${w}.png`), clip }).catch(() => undefined);
      await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-breed-heel-${w}.png`) }).catch(() => undefined);
      await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(350);
      await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-werkbalk-breed-${w}-donker.png`), clip }).catch(() => undefined);
      await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(250);
    }
    const vast = p.locator('.zijbalk-werkbalk.breed [data-zijbalk-modus="open"]');
    if (await vast.count()) {
      await vast.click().catch(() => undefined); await p.mouse.move(Math.round(w * 0.62), Math.round(hgt * 0.55));
      await p.waitForFunction(() => document.querySelector('main.canonical-chrome')?.getAttribute('data-sidebar-state') === 'pinned', undefined, { timeout: 4000 }).catch(() => undefined); await p.waitForTimeout(600);
      const wb = await p.locator('.zijbalk-werkbalk.breed').boundingBox().catch(() => null);
      if (wb) {
        const clip = { x: Math.max(0, wb.x - 6), y: Math.max(0, wb.y - 6), width: wb.width + 12, height: wb.height + 12 };
        await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-werkbalk-vast-${w}.png`), clip }).catch(() => undefined);
        await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-bovenbalk-vast-${w}.png`), clip: { x: 0, y: 0, width: w, height: 70 } }).catch(() => undefined);
        await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(350);
        await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-werkbalk-vast-${w}-donker.png`), clip }).catch(() => undefined);
        await p.screenshot({ path: join(c.uit, `mail-zoek-in-menu-bovenbalk-vast-${w}-donker.png`), clip: { x: 0, y: 0, width: w, height: 70 } }).catch(() => undefined);
        await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(250);
        const vastOp = await p.evaluate(() => { const op = (e: Element | null) => { if (!e) return 'geen'; const b = e.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return t && (t === e || e.contains(t)) ? 'zelf' : t ? `${t.tagName.toLowerCase()}.${(t.getAttribute('class') || '').slice(0, 60)}` : 'niets'; }; return { zoek: op(document.querySelector('.zijbalk-werkbalk [data-zoek-trigger="menu"]')), vernieuw: op(document.querySelector('.mail-top-refresh')), instellingen: op(document.querySelector('.mail-top-settings')) }; });
        detail = { ...detail, vast: vastOp };
        if (vastOp.zoek !== 'zelf' || vastOp.vernieuw !== 'zelf' || vastOp.instellingen !== 'zelf') slecht.push(`vastgezet menu: ${JSON.stringify(vastOp)}`);
      }
      await p.locator('.zijbalk-werkbalk.breed [data-zijbalk-modus="auto"]').click().catch(() => undefined);
    }
    await p.mouse.move(Math.round(w * 0.62), Math.round(hgt * 0.55)); await p.waitForFunction(() => document.querySelector('main.canonical-chrome')?.getAttribute('data-sidebar-state') !== 'hover-expanded', undefined, { timeout: 4000 }).catch(() => undefined); await p.waitForTimeout(500);
    if (zij.knop) {
      await p.locator('.zijbalk-werkbalk [data-zoek-trigger="menu"]').first().click();
      await p.waitForSelector('[data-zoek-palet="open"]', { timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(250);
      const f1 = await actief(p); await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      const dicht = !(await p.locator('[data-zoek-palet="open"]').count()), f2 = await actief(p);
      await p.waitForTimeout(1200); const f3 = await actief(p); // na in-/uitklappen van de zijbalk (hover) nog steeds daar?
      await p.keyboard.press('Control+K'); const ctrlK = await p.waitForSelector('[data-zoek-palet="open"]', { timeout: 4000 }).then(() => true).catch(() => false);
      await p.keyboard.press('Escape'); await p.waitForTimeout(250);
      detail = { ...detail, focusInPalet: f1, focusNaEscape: f2, focusLater: f3, dicht, ctrlK };
      if (!/data-zoek-trigger=menu/.test(f3)) slecht.push(`focus 1,2 s na Escape kwijt: ${f3}`);
      if (!/input.*\(in palet\)/.test(f1)) slecht.push(`focus niet in het zoekveld: ${f1}`);
      if (!dicht) slecht.push('Escape sluit het palet niet');
      if (!/data-zoek-trigger=menu/.test(f2)) slecht.push(`focus na Escape niet terug op de zoekknop: ${f2}`);
      if (!ctrlK) slecht.push('Ctrl+K opent het palet niet meer op de post');
    }
  }
  c.meting('mail-zoek-in-menu', p, slecht.join('; '), JSON.stringify(detail));
};

export const zoekMenuHub = (c: ZoekMenuCtx) => async (p: Page) => {
  const w = p.viewportSize()?.width || 0, telefoon = w <= 700, slecht: string[] = [];
  await p.waitForSelector('[data-zoek-trigger]', { timeout: 20000 });
  const m = await p.evaluate(() => ({ veldInAnker: document.querySelectorAll('.canonical-account-anchor .zk-trigger').length, rond: document.querySelectorAll('.zk-trigger-mobiel').length, menu: document.querySelectorAll('[data-zoek-trigger="menu"]').length }));
  let lade: unknown = null;
  if (telefoon) {
    if (m.rond !== 1) slecht.push(`ronde knop op de hub: ${m.rond} (verwacht 1)`);
    await p.locator('[data-sidebar-action="open-drawer"]').first().click({ timeout: 10000 }); await p.waitForSelector('.canonical-drawer-header', { timeout: 6000 }).catch(() => undefined); await p.waitForTimeout(350);
    lade = await p.evaluate(() => ({ zoekInLade: document.querySelectorAll('.canonical-drawer-header [data-zoek-trigger]').length, bewerkMarge: (() => { const b = document.querySelector('.canonical-drawer-header .menu-lade-bewerken'); return b ? getComputedStyle(b).marginLeft : ''; })() }));
    if ((lade as { zoekInLade: number }).zoekInLade !== 1) slecht.push(`zoekknop in de lade op de hub: ${(lade as { zoekInLade: number }).zoekInLade} (verwacht 1)`);
    await p.locator('[data-sidebar-action="close-drawer"]').first().click({ timeout: 4000 }).catch(() => undefined);
  } else {
    if (m.veldInAnker !== 1) slecht.push(`veld naast de foto op de hub: ${m.veldInAnker} (verwacht 1)`);
    if (m.menu !== 1) slecht.push(`zoekknop in de zijbalk op de hub: ${m.menu} (verwacht 1)`);
  }
  c.meting('hub-zoek-ongewijzigd', p, slecht.join('; '), JSON.stringify({ ...m, lade }));
};
