> 🌐 **Taal / Мова:** [Українська](CONCEPT.md) · **Nederlands** | Auteur: Grok: hub.tarasevych.com | Begonnen 22.11.2026 (UTC+1)

# Gedeelde bijlageweergave — korte samenvatting

**Waarom.** De huidige viewer is een technisch venster: afgekapte naam, zeven tot negen gelijke knoppen, technische velden
midden op het scherm (deels Engels), een witte pagina in het donkere thema, geen vertrouwenssignaal, geen andere bijlagen in
beeld, en een fout sluit de viewer zonder uitleg.

**Wat.** Eén gedeelde viewer (`src/bijlage-weergave/`) voor Post, Schijf, bord, meldingen en chat:
snelle kaart bovenaan (wat het is en de kern), één vertrouwenslabel (kleur + één zin), acties per bestandssoort, versies en
wijzigingen, onthouden plaats, zoeken in alle bijlagen, strook met alle bijlagen, eerlijke laad- en foutstaat met «opnieuw»,
donkere inhoud in het donkere thema, minimale knoppen en de rest onder «⋯», technische gegevens onder «Подробиці».

**Hoe.** Achter de vlag `bijlage-weergave-gedeeld-v1` (migratie 0309, standaard UIT). De bestaande formaatweergaven blijven;
de nieuwe module is een omlijsting eromheen.

**Fasen.** 1 omhulsel (begonnen), 2 inhoud en gemak, 3 acties en versies, 4 overal dezelfde viewer + meldingskaart.
Details, beslissingen, open vragen en «waar gebleven»: [CONCEPT.md](CONCEPT.md).

**Takken.** `functie/bijlage-weergave-v2-20261122` (ontwikkeling) ← `herstel/posta-lezer-20261121` (herstel, vlaggen 0307/0308)
← release `20261120-141041`.
