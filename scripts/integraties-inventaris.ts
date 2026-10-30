// UI-013: maakt docs/integraties/INVENTARIS.md uit shared/integraties-register.ts (één bron). Uitvoeren: npx tsx scripts/integraties-inventaris.ts
import { writeFileSync } from 'node:fs';
import { INTEGRATIES, CATEGORIEEN } from '../shared/integraties-catalogus';
import { REGISTER, groepVan, GROEPEN } from '../shared/integraties-register';
const r = new Map(REGISTER.map((x) => [x.id, x]));
const tel: Record<string, number> = {};
const regels: string[] = [];
for (const c of CATEGORIEEN) {
  const lijst = INTEGRATIES.filter((i) => i.cat === c.id);
  regels.push(`\n## ${c.nl} (${lijst.length})\n`, '| id | naam | catalogus | uitvoering | groep (zonder account) | officiële wijze | doeldienst | prio | nog te doen | beperking aanbieder | bewijs |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const i of lijst) {
    const x = r.get(i.id)!; const g = groepVan(i, null, x); tel[g] = (tel[g] || 0) + 1;
    const cel = (s: string) => s.replace(/\|/g, '/');
    regels.push(`| ${i.id} | ${cel(i.naam)} | ${i.status} | ${x.uitvoering} | ${GROEPEN.find((y) => y.id === g)!.nl} | ${cel(x.officieel)} | ${x.doelDienst} | ${x.prioriteit} | ${cel(x.nogTeDoen[1])} | ${cel(x.beperking?.[1] || '')} | ${x.bewijs.map((b) => '`' + b + '`').join(' ')} |`);
  }
}
const uit = REGISTER.reduce((m, x) => ((m[x.uitvoering] = (m[x.uitvoering] || 0) + 1), m), {} as Record<string, number>);
const kop = `# Inventaris integraties (UI-013, gegenereerd)\n\nBron: \`shared/integraties-register.ts\` (machineleesbaar) + \`shared/integraties-catalogus.ts\`. Niet met de hand bewerken: \`npx tsx scripts/integraties-inventaris.ts\`.\n\nTotaal: **${INTEGRATIES.length}** posities. Uitvoering in de code: werkend ${uit.werkend || 0}, basis ${uit.basis || 0}, geen ${uit.geen || 0}.\nGroep zonder gekoppeld account: ${GROEPEN.map((g) => `${g.nl} ${tel[g.id] || 0}`).join(', ')}.\n\n«werkend» = er bestaat een volledige stroom op een pagina van de site (koppelen, controleren, ontkoppelen). Dat is NIET hetzelfde als «getest met een echt account»: dat is in UI-013 niet gebeurd (geen echte accounts/geheimen).\n\nPrioriteit: 1 = infrastructuur en officiële interface aanwezig, eerst doen; 2 = daarna; 3 = afhankelijk van derden (betaalde API, app-review, hardware) of geen publieke interface.\n`;
writeFileSync('docs/integraties/INVENTARIS.md', kop + regels.join('\n') + '\n');
console.log(INTEGRATIES.length, uit, tel);
