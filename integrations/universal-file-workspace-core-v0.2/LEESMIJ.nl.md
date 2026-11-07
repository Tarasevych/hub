> 🌐 **Taal / Мова:** [Українська](ОГЛЯД-ЯДРА-ФАЙЛІВ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../../docs/INDEX.nl.md)

# Universal Bestand Workspace · Mijn Ruimte

Dit is een **lokaal startpakket voor integratie**, geen patch voor de productierepository.

**Inhoud:** `src/contracts.ts` (model), `src/sniff.ts` (magic/ZIP-manifest), `src/registry.ts` (adapters/engines/ACL), `src/default-engines.ts` (manifest van kandidaten), `test/` (6 Node-tests), `docs/` (audit en migratieplan), `demo/index.html` (zelfstandige adaptieve demo-interface).

## Controle

```sh
npm test
```

Vereist lokaal beschikbare Node.js 22+ en TypeScript (`tsc`). Geen netwerkafhankelijkheden in dit startpakket. De demo bestaat uit statische HTML/JS/CSS met uitsluitend lokaal openen van bestanden; alle netwerkbronlabels zijn demonstratief.

## Niet geclaimd als voltooid

De huidige productiebroncode is niet gewijzigd, de huidige Git-commit is niet gecontroleerd, echte OAuth/Drive/Gmail/GitHub-adapters zijn nog niet gekoppeld, en server-side conversies en cryptografische validatie ontbreken. `proposedEngines` zijn manifesten voor toekomstige integraties; de bijbehorende daadwerkelijke pakketten maken geen deel uit van dit startpakket. Vóór opname in productie zijn echte integratie, tests en een beveiligingsbeoordeling vereist.

## Basisprioriteit

Bestaande viewerfuncties hergebruiken voordat ze worden vervangen. Eerst de alleen-lezen kern en migratie van afnemers, daarna volwaardige engine-instellingen, schrijf-/conversietaken en documenteditors.
