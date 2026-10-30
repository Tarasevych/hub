// Стенд (22.10.2026, зона A): «Діагностика» → «Сторінки й маршрути» → картка «Рендеринг сторінок (браузер на сервері)» відкрита, з кнопкою
// «Перевірити рендеринг», «?» і списком сторінок останнього прогону. Крок admin-diagnostiek-rendering (fase tech).
// Результат rook-controle.json для стенду: змінна OPDRACHT_STATUS_DIR вказує на теку зі справжнім JSON (напр. rook-eind.json з прогону).
type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; fase?: 'prive' | 'tech' };

export function rookStappen(o: { adminUrl: string; zeg: (s: string) => void }): Stap[] {
  const open = async (p: Page) => {
    await p.locator('[data-adg-tab="paginas"]').first().click({ timeout: 8000 });
    await p.waitForTimeout(400);
    const kaart = p.locator('[data-adg-check="pagina-rendering"]').first();
    await kaart.scrollIntoViewIfNeeded().catch(() => undefined);
    await kaart.locator('.adg-kaart-kop').first().click({ timeout: 8000 });
    await p.waitForTimeout(900);
    const knop = p.locator('[data-adg-rendering-knop]').first();
    const lijstKnop = kaart.locator('.adg-details-knoppen button.adg-knop-stil').last();
    if (await lijstKnop.count()) { await lijstKnop.click({ timeout: 5000 }).catch(() => undefined); await p.waitForTimeout(400); }
    o.zeg(`   rendering-knop aanwezig: ${await knop.count()} · uitgeschakeld: ${await knop.isDisabled().catch(() => true)} · browser-attribuut: ${await p.locator('[data-adg-rendering]').first().getAttribute('data-browser').catch(() => '?')}`);
  };
  return [{ naam: 'admin-diagnostiek-rendering', url: `${o.adminUrl}/diagnostiek`, fase: 'tech', na: open }];
}
