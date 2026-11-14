// IDENTITEIT-015: HTML-звіт для власника з відомості дій (ВІДОМІСТЬ-ДІЙ.json), знімків і відомостей про версію/архів.
// Нічого не вигадує: усі числа рахуються з рядків відомості. Знімки копіюються в теку звіту (schermen/) — лише знеособлені.
// Gebruik: node scripts/identiteit-maquette/verslag-html.mjs --uit <map> --meta <meta.json> [--schermen <map> ...]
// meta.json: { live:{versie,commit}, getest:{tak,commit}, pakket:{naam,sha256,controle}, pr:"url", opmerkingen:[...] }
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const alle = (n) => process.argv.flatMap((a, i) => (a === n ? [process.argv[i + 1]] : []));
const UIT = arg('--uit');
if (!UIT) { console.error('--uit <map> is verplicht'); process.exit(2); }
const meta = arg('--meta') ? JSON.parse(readFileSync(arg('--meta'), 'utf8')) : {};
const d = JSON.parse(readFileSync('docs/ontwerp/identiteit-account/ВІДОМІСТЬ-ДІЙ.json', 'utf8'));
const STATEN = ['працює в цьому оформленні', 'працює в іншому місці', 'частково працює', 'є лише в макеті', 'потребує налаштування власника', 'недоступно за задумом'];
const KLASSE = { 'працює в цьому оформленні': 'ok', 'працює в іншому місці': 'elders', 'частково працює': 'deels', 'є лише в макеті': 'maquette', 'потребує налаштування власника': 'eigenaar', 'недоступно за задумом': 'nvt' };
const SECTIE_NAAM = { personalization: 'Персоналізація', menu: 'Меню', themes: 'Теми', languages: 'Мови', widgets: 'Віджети', sharing: 'Спільний доступ', identities: 'Ідентичності', account: 'Акаунт і дані', sessions: 'Сесії та пристрої', methods: 'Способи входу', security: 'Безпека', recovery: 'Відновлення доступу' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const na = (r) => r.staatNa || r.staatVoor;
const tel = (rs, f) => Object.fromEntries(STATEN.map((s) => [s, rs.filter((r) => f(r) === s).length]));
const acties = d.acties;
const voor = tel(acties, (r) => r.staatVoor), naT = tel(acties, na);
const posV49 = d.posities.filter((p) => p.bron === 'v49').length, posExtra = d.posities.length - posV49;
const bewezen = acties.filter((r) => (r.testen || []).some((t) => /tests\/e2e\//.test(t))).length;

// Знімки: копіюємо в schermen/ і групуємо за префіксом групи (015-<група>-…, <група>-…).
mkdirSync(join(UIT, 'schermen'), { recursive: true });
const beelden = [];
for (const map of alle('--schermen')) {
  if (!map || !existsSync(map)) continue;
  for (const f of readdirSync(map).filter((n) => /\.(png|jpe?g|webp)$/i.test(n)).sort()) {
    const doel = basename(f);
    if (!beelden.some((b) => b.naam === doel)) { copyFileSync(join(map, f), join(UIT, 'schermen', doel)); beelden.push({ naam: doel, groep: (doel.replace(/^015-/, '').match(/^[a-z]+/i) || ['інше'])[0] }); }
  }
}

const balk = (telling, totaal) => `<div class="balk" role="img" aria-label="${esc(STATEN.map((s) => `${s}: ${telling[s]}`).join('; '))}">${STATEN.filter((s) => telling[s]).map((s) => `<span class="st-${KLASSE[s]}" style="flex:${telling[s]}" title="${esc(s)}: ${telling[s]}"></span>`).join('')}</div><div class="balk-bijschrift">${totaal} дій</div>`;
const pil = (s) => `<span class="pil st-${KLASSE[s] || 'nvt'}">${esc(s)}</span>`;

const secties = [...new Set(d.posities.map((p) => p.sectie))];
const sectieRijen = secties.map((s) => {
  const rs = acties.filter((r) => r.sectie === s);
  const ok = rs.filter((r) => /^працює/.test(na(r))).length;
  return `<tr><th scope="row">${esc(SECTIE_NAAM[s] || s)}</th><td class="num">${rs.length}</td><td class="num">${rs.filter((r) => /^працює/.test(r.staatVoor)).length}</td><td class="num">${ok}</td><td class="balkcel">${balk(tel(rs, na), rs.length)}</td></tr>`;
}).join('');

const open = acties.filter((r) => !/^працює/.test(na(r)));
const openRijen = open.map((r) => `<tr><td>${esc(SECTIE_NAAM[r.sectie] || r.sectie)}</td><td><strong>${esc(r.positieUk)}</strong><br><span class="zacht">${esc(r.actie)}</span></td><td>${pil(na(r))}</td><td>${esc(r.reden || r.ontbreekt || '')}</td></tr>`).join('');

const detail = secties.map((s) => {
  const rs = acties.filter((r) => r.sectie === s);
  return `<details class="sectie" id="s-${esc(s)}"><summary><span class="s-naam">${esc(SECTIE_NAAM[s] || s)}</span><span class="s-tel">${rs.filter((r) => /^працює/.test(na(r))).length} з ${rs.length} працюють</span></summary>
  <div class="tabelvak"><table class="detail"><thead><tr><th>Позиція і дія</th><th>Хто, умови</th><th>До роботи</th><th>Після</th><th>Ознака готовності</th><th>Доказ</th></tr></thead><tbody>
  ${rs.map((r) => `<tr><td><strong>${esc(r.positieUk)}</strong><br><span class="zacht">${esc(r.actie)}</span></td><td>${esc(r.wie)}${r.voorwaarden ? `<br><span class="zacht">${esc(r.voorwaarden)}</span>` : ''}</td><td>${pil(r.staatVoor)}</td><td>${pil(na(r))}${r.versie ? `<br><code>${esc(String(r.versie).slice(0, 10))}</code>` : ''}${r.omgeving ? `<br><span class="zacht">${esc(r.omgeving)}</span>` : ''}</td><td>${esc(r.gereedAls)}</td><td>${(r.testen || []).map((t) => `<code>${esc(t)}</code>`).join('<br>')}${r.resultaat ? `<br>${esc(r.resultaat)}` : ''}</td></tr>`).join('')}
  </tbody></table></div></details>`;
}).join('\n');

const groepen = [...new Set(beelden.map((b) => b.groep))];
const galerij = beelden.length ? groepen.map((g) => `<section class="galerij-groep"><h3>${esc(g)}</h3><div class="galerij">${beelden.filter((b) => b.groep === g).map((b) => `<figure><a href="schermen/${esc(b.naam)}" target="_blank" rel="noopener"><img loading="lazy" src="schermen/${esc(b.naam)}" alt="${esc(b.naam)}"></a><figcaption>${esc(b.naam.replace(/\.(png|jpe?g|webp)$/i, ''))}</figcaption></figure>`).join('')}</div></section>`).join('') : '<p class="zacht">Знімки ще не додано.</p>';

const legenda = STATEN.map((s) => `<li>${pil(s)} <span class="num">${voor[s]} → ${naT[s]}</span></li>`).join('');
const live = meta.live || {}, getest = meta.getest || {}, pakket = meta.pakket || {};
const html = `<title>Звірка центру облікового запису</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Manrope:wght@600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Звіт-відомість: зверху підсумок і відкриті позиції, нижче — розгортні розділи з рядком на кожну дію, знімки, версії. */
:root{
  --bg:#f5f6f4;--vlak:#ffffff;--tekst:#1c2422;--zacht:#5a6764;--lijn:#d9dfdc;--accent:#2f6f73;
  --ok:#2e7d4f;--elders:#3d6fa8;--deels:#b7791f;--maquette:#8a5aa8;--eigenaar:#a14d2c;--nvt:#7b8582;
  --kop:"Manrope",system-ui,sans-serif;--tekstfont:"IBM Plex Sans",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111716;--vlak:#18201f;--tekst:#e5ebe9;--zacht:#9aa8a4;--lijn:#2c3735;--accent:#6fb5b9;--ok:#5cc28a;--elders:#7fa9dc;--deels:#e2a94b;--maquette:#bb8fd6;--eigenaar:#e08a66;--nvt:#8f9a97;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#111716;--vlak:#18201f;--tekst:#e5ebe9;--zacht:#9aa8a4;--lijn:#2c3735;--accent:#6fb5b9;--ok:#5cc28a;--elders:#7fa9dc;--deels:#e2a94b;--maquette:#bb8fd6;--eigenaar:#e08a66;--nvt:#8f9a97;color-scheme:dark}
body{background:var(--bg);color:var(--tekst);font:15px/1.55 var(--tekstfont);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 56px}
main{max-width:1180px;margin:0 auto;display:grid;gap:34px}
h1,h2,h3{font-family:var(--kop);text-wrap:balance;margin:0;line-height:1.2}
h1{font-size:clamp(1.6rem,3.4vw,2.3rem);font-weight:800}
h2{font-size:1.3rem;font-weight:700}
h3{font-size:1.02rem;font-weight:700}
p{margin:0;max-width:72ch}
.zacht{color:var(--zacht);font-size:.88rem}
.num,code{font-family:var(--mono);font-variant-numeric:tabular-nums}
code{font-size:.8rem;word-break:break-all}
header{display:grid;gap:10px}
.kicker{font:600 .75rem/1 var(--tekstfont);letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.versies{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.versie{background:var(--vlak);border:1px solid var(--lijn);border-radius:12px;padding:14px 16px;display:grid;gap:4px;min-width:0}
.versie b{font-family:var(--kop);font-size:1.05rem}
.kern{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}
.kern div{display:grid;gap:2px}
.kern .getal{font:800 2rem/1 var(--kop)}
.legenda{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px 16px}
.legenda li{display:flex;align-items:center;gap:8px}
.pil{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.78rem;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.pil.st-ok{color:var(--ok)}.pil.st-elders{color:var(--elders)}.pil.st-deels{color:var(--deels)}.pil.st-maquette{color:var(--maquette)}.pil.st-eigenaar{color:var(--eigenaar)}.pil.st-nvt{color:var(--nvt)}
.balk{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--lijn);min-width:120px}
.balk span.st-ok{background:var(--ok)}.balk span.st-elders{background:var(--elders)}.balk span.st-deels{background:var(--deels)}.balk span.st-maquette{background:var(--maquette)}.balk span.st-eigenaar{background:var(--eigenaar)}.balk span.st-nvt{background:var(--nvt)}
.balk-bijschrift{font-size:.75rem;color:var(--zacht)}
.tabelvak{overflow-x:auto;border:1px solid var(--lijn);border-radius:12px;background:var(--vlak)}
table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;vertical-align:top;padding:9px 12px;border-bottom:1px solid var(--lijn)}
thead th{font:600 .74rem/1.2 var(--tekstfont);letter-spacing:.05em;text-transform:uppercase;color:var(--zacht);background:var(--bg)}
tbody tr:last-child>*{border-bottom:0}
table.detail{min-width:980px}
td.num{text-align:right}
.balkcel{min-width:180px}
details.sectie{border:1px solid var(--lijn);border-radius:12px;background:var(--vlak)}
details.sectie>summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px;padding:12px 16px;font-family:var(--kop);font-weight:700}
details.sectie>summary::-webkit-details-marker{display:none}
details.sectie[open]>summary{border-bottom:1px solid var(--lijn)}
details.sectie .tabelvak{border:0;border-radius:0 0 12px 12px}
.s-tel{font:500 .85rem var(--tekstfont);color:var(--zacht)}
summary:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.secties{display:grid;gap:10px}
.galerij{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
.galerij-groep{display:grid;gap:10px}
figure{margin:0;display:grid;gap:4px;min-width:0}
figure img{width:100%;aspect-ratio:3/4;object-fit:cover;object-position:top;border:1px solid var(--lijn);border-radius:8px;background:var(--vlak)}
figcaption{font:.72rem var(--mono);color:var(--zacht);word-break:break-all}
a{color:var(--accent)}
.opmerkingen{margin:0;padding-left:1.1rem;display:grid;gap:4px;max-width:80ch}
@media (max-width:640px){.kern .getal{font-size:1.6rem}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
<main>
<header>
  <span class="kicker">IDENTITEIT-015 · id.tarasevych.com</span>
  <h1>Звірка центру облікового запису з погодженим оформленням v49</h1>
  <p class="zacht">Кожна з ${posV49} позицій оформлення v49${posExtra ? ` і ${posExtra} доданих живою картою` : ''} розкладена на дії людини. Для кожної дії: стан до роботи, що змінено, у якій версії перевірено й що спостережено. Числа порахувано з відомості <code>docs/ontwerp/identiteit-account/ВІДОМІСТЬ-ДІЙ.json</code>.</p>
</header>
<section class="versies" aria-label="Версії">
  <div class="versie"><span class="zacht">На робочому сайті (перед збиранням)</span><b class="num">${esc(live.versie || '—')}</b><code>${esc(live.commit || '')}</code></div>
  <div class="versie"><span class="zacht">Перевірено у випробувальному середовищі</span><b class="num">${esc(String(getest.commit || '—').slice(0, 12))}</b><code>${esc(getest.tak || '')}</code></div>
  <div class="versie"><span class="zacht">Архів для встановлення</span><b class="num">${esc(pakket.naam || 'ще не зібрано')}</b><code>${esc(pakket.sha256 ? `sha256 ${pakket.sha256}` : '')}</code>${pakket.controle ? `<span class="zacht">${esc(pakket.controle)}</span>` : ''}</div>
</section>
<section class="kern" aria-label="Підсумок">
  <div><span class="getal num">${acties.length}</span><span class="zacht">дій у відомості</span></div>
  <div><span class="getal num">${acties.filter((r) => /^працює/.test(r.staatVoor)).length} → ${acties.filter((r) => /^працює/.test(na(r))).length}</span><span class="zacht">працюють: до → після</span></div>
  <div><span class="getal num">${open.length}</span><span class="zacht">відкриті (передумова власника, за задумом або недороблено)</span></div>
  <div><span class="getal num">${bewezen}</span><span class="zacht">доведено перевіркою в браузері</span></div>
</section>
<section aria-labelledby="h-stan"><h2 id="h-stan">Стан дій: до → після</h2><ul class="legenda" style="margin-top:12px">${legenda}</ul></section>
<section aria-labelledby="h-razd" style="display:grid;gap:12px"><h2 id="h-razd">За розділами</h2>
  <div class="tabelvak"><table><thead><tr><th>Розділ</th><th>Дій</th><th>Працювало</th><th>Працює</th><th>Розподіл після</th></tr></thead><tbody>${sectieRijen}</tbody></table></div></section>
<section aria-labelledby="h-open" style="display:grid;gap:12px"><h2 id="h-open">Відкриті позиції і що потрібно для завершення</h2>
  <div class="tabelvak"><table><thead><tr><th>Розділ</th><th>Позиція і дія</th><th>Стан</th><th>Чого бракує / передумова</th></tr></thead><tbody>${openRijen || '<tr><td colspan="4">Немає</td></tr>'}</tbody></table></div></section>
${meta.opmerkingen?.length ? `<section aria-labelledby="h-opm" style="display:grid;gap:10px"><h2 id="h-opm">Примітки</h2><ul class="opmerkingen">${meta.opmerkingen.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></section>` : ''}
<section aria-labelledby="h-det" style="display:grid;gap:12px"><h2 id="h-det">Відомість: рядок на кожну дію</h2><div class="secties">${detail}</div></section>
<section aria-labelledby="h-beeld" style="display:grid;gap:14px"><h2 id="h-beeld">Знімки ключових станів</h2><p class="zacht">Знеособлені: пробні адреси замасковано, коди й QR розмито. Телефон 380×800 і комп'ютер 1280, українська й нідерландська, світла й темна тема.</p>${galerij}</section>
${meta.pr ? `<p class="zacht">Чернетка PR: <a href="${esc(meta.pr)}" target="_blank" rel="noopener">${esc(meta.pr)}</a></p>` : ''}
</main>
`;
mkdirSync(UIT, { recursive: true });
writeFileSync(join(UIT, 'index.html'), html);
console.log(`verslag: ${join(UIT, 'index.html')} · дій ${acties.length} · знімків ${beelden.length}`);
