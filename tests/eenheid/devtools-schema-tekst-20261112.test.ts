// MCP-R0 (12.11.2026): Claude відкидав 15 браузерних інструментів (click, fill, take_snapshot, list_pages …) з помилкою
// «schema/properties/browser/description must be string» — опис параметра був об'єктом {uk, nl} (p(…)), а не рядком.
// Перевіряємо фактичний вміст: кожен `description` у кожному схемі chrome-devtools-назв — непорожній рядок у вибраній мові.
// Zonder database: devtoolsDefinities is puur.
import { DEVTOOLS_ALIASES } from '../../backend/connectors-hulpmiddelen';
import { devtoolsDefinities } from '../../backend/connector-v2-browser';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';

export async function main(): Promise<number> {
let fouten = 0;
const fout = (m: string) => { fouten++; console.error(`✗ ${m}`); };

function descriptions(v: unknown, pad: string, uit: Array<{ pad: string; w: unknown }>) {
  if (Array.isArray(v)) { v.forEach((x, i) => descriptions(x, `${pad}[${i}]`, uit)); return; }
  if (!v || typeof v !== 'object') return;
  for (const [k, w] of Object.entries(v as Record<string, unknown>)) {
    if (k === 'description') uit.push({ pad: `${pad}.description`, w });
    descriptions(w, `${pad}.${k}`, uit);
  }
}

// Усі внутрішні браузерні цілі видимі → повний список псевдонімів.
const alle = new Set<string>([...Object.values(DEVTOOLS_ALIASES).map((a) => a.target), ...V2_OPTIES.filter((o) => o.intern).map((o) => o.intern as string)]);

for (const taal of ['uk', 'nl'] as const) {
  const defs = devtoolsDefinities(alle, taal, 'gebruiker');
  if (defs.length < 10) fout(`${taal}: te weinig definities (${defs.length})`);
  for (const d of defs) {
    if (typeof d.description !== 'string' || !d.description.trim()) fout(`${taal} ${d.name}: tool-description geen string`);
    if (typeof d.description === 'string' && d.description.includes('[object Object]')) fout(`${taal} ${d.name}: [object Object] in description`);
    const lijst: Array<{ pad: string; w: unknown }> = [];
    descriptions(d.inputSchema, `${d.name}.inputSchema`, lijst);
    for (const { pad, w } of lijst) if (typeof w !== 'string' || !w.trim()) fout(`${taal} ${pad}: ${JSON.stringify(w)?.slice(0, 80)}`);
    // JSON-serialisatie zoals op de lijn: opnieuw parsen geeft hetzelfde (geen functies/undefined in het schema)
    const rond = JSON.parse(JSON.stringify(d.inputSchema));
    if (rond?.type !== 'object') fout(`${taal} ${d.name}: inputSchema.type is niet "object"`);
  }
  // Мова справді та, що вибрано: кирилиця в uk, немає кирилиці в nl.
  const browser = defs.find((d) => d.name === 'list_pages') ?? defs[0];
  const bd = (browser.inputSchema as any)?.properties?.browser?.description;
  if (typeof bd === 'string') {
    if (taal === 'uk' && !/[А-Яа-яІіЇїЄєҐґ]/.test(bd)) fout(`uk: browser.description niet Oekraïens: ${bd}`);
    if (taal === 'nl' && /[А-Яа-яІіЇїЄєҐґ]/.test(bd)) fout(`nl: browser.description bevat Cyrillisch: ${bd}`);
  }
  console.log(`${taal}: ${defs.length} definities gecontroleerd`);
}

if (fouten) { console.error(`devtools-schema-tekst: ${fouten} fout(en)`); return 1; }
console.log("✓ devtools-schema-tekst: alle descriptions zijn strings in de gekozen taal");
return 0;
}
