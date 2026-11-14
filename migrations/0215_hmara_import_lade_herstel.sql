-- SEC-002 (wolk-07, 12.11.2026): herstel van rijen die de import uit Google Photos in de VERKEERDE lade zette.
--
-- Wat er mis was: backend/cloud-platform.ts → cloudImportExternalMedia schreef het BESTAND in de boom van de lade van de
-- aanroep (technisch: `cloud-technisch/<hash>/…`), maar de RIJ in cloud_items_v1 zonder het veld `ruimte`. Een rij zonder
-- `ruimte` is persoonlijk (shared/ruimte-scheiding.ts, hoortBij). Een beeld dat in de technische ruimte werd geïmporteerd,
-- stond daardoor met naam, grootte en werkruimte in de PERSOONLIJKE hmara van dezelfde mens, en was in geen van beide
-- ruimtes te openen (padInLade weigert een technisch pad in de persoonlijke lade; de technische lade zag de rij niet).
-- De code schrijft de lade nu mee; deze migratie zet de rijen van vóór de patch terug waar hun bestand ligt.
--
-- Welke rijen: alleen cloud_items_v1 waarvan het opslagpad PRECIES in de technische boom van de EIGEN mens ligt
-- (`cloud-technisch/` + de eerste 18 hex-tekens van sha256(ownerUserId) + `/` — dezelfde regel als cloudVoorvoegsel) en
-- die nog niet 'technisch' heten. Zo'n rij kan nooit een werkend persoonlijk bestand zijn, dus er verdwijnt niets uit de
-- persoonlijke hmara dat daar te openen was. Titel, pad en tijden in de rij blijven onaangeroerd.
-- Rijen met een pad in de boom van een ANDER (bestaan niet, maar toch) blijven staan: die horen bij geen enkele lade.
--
-- NA DE TOETS (aantekening 1 van de onafhankelijke controle, 12.11.2026) — wat AAN zo'n rij hing, gaat mee:
--   1. De kolom updated_at van elke verplaatste rij wordt «nu»: de zoekindex (backend/zoek/bronnen.ts, stapRecords) ziet een
--      wijziging alleen aan die kolom; zonder dit vond «Пошук усюди» in de technische ruimte het bestand nooit.
--   2. Een map (`mapId`) of werkruimte (`workspaceId`, `suggestedWorkspaceId`) van de PERSOONLIJKE lade gaat er niet mee in:
--      in de technische hmara bestaat die niet. Wijst het veld naar een technische map/werkruimte van dezelfde mens, dan blijft het.
--   3. De persoonlijke fotobibliotheek (backend/foto-dienst.ts, «indexeer») zag het gelekte bestand ook en maakte er een eigen
--      rij foto_media_v1 van: naam, grootte, sha256, EXIF en miniatuur van een TECHNISCH bestand in de persoonlijke lade. Elke
--      persoonlijke fotorij van dezelfde mens die naar een technisch hmara-bestand van die mens wijst (ook een bestand dat al
--      vóór vandaag technisch heette — die koppeling kan alleen uit het lek komen):
--        a. heeft de technische bibliotheek al een rij voor datzelfde bestand → de persoonlijke rij (opslag 'cloud') verdwijnt;
--        b. is het een EIGEN persoonlijke foto die «indexeer» alleen aan het bestand koppelde (er is een andere herkomst) → zij
--           blijft persoonlijk, maar verliest de koppeling en de herkomstregel met de naam van het technische bestand;
--        c. anders (een virtuele rij, of een eigen kopie die alleen uit het technische bestand komt) → naar de technische lade,
--           met miniatuur, etiketten en favoriet, maar zonder de albums van de persoonlijke lade.
--      Rijen van een ANDERE mens, of die naar een persoonlijk of vreemd bestand wijzen, worden niet aangeraakt.
--
--   4. (tweede controle, aantekening 4) Ook vNext maakte in de persoonlijke ruimte rijen met de NAAM van het gelekte bestand:
--        a. een taak «kopiëren naar Google Drive» (cloud_taken_v1, bron.dienst 'eigen', naam = titel van het bestand) → weg;
--           zij kan niets meer doen (de bron ligt niet meer in haar lade) en is alleen nog een naam in de persoonlijke takenlijst;
--        b. een deelkoppeling (app.cloud_deel_koppelingen, 0210) die ALLEEN dat bestand deelt (bestand, deel, archiefpad, of een
--           selectie met alleen technische bestanden) → ingetrokken en, met haar statistiek, naar de technische lade (daar hoort
--           de geschiedenis van wie een technisch bestand opende); intrekken gaat vóór, zodat zij daar nooit weer werkt;
--        c. een gemengde selectie (ook persoonlijke bestanden of mappen) → blijft persoonlijk en werkzaam, maar zonder de
--           technische bestanden; verwees `doel_id` naar zo'n bestand, dan wijst het naar het volgende element en verdwijnt de
--           afgeleide naam (`doel_naam` leeg; `naam` was de standaardnaam → «Вибір · Selectie»).
--      Alleen koppelingen en taken van dezelfde mens als het technische bestand.
--
-- Idempotent: een tweede keer vindt geen rij meer (alles is dan technisch, losgekoppeld of weg). Op een installatie zonder
-- zulke rijen doet dit niets. Terugdraaien is niet zinvol: het zou het lek terugbrengen.

-- 1. De rijen van de hmara zelf.
UPDATE app.records c
   SET data = c.data || jsonb_build_object('ruimte', 'technisch')
         || CASE WHEN COALESCE(c.data->>'mapId', '') <> '' AND NOT EXISTS (
                   SELECT 1 FROM app.records m
                    WHERE m.tbl = 'cloud_mappen_v1' AND m.id = c.data->>'mapId'
                      AND m.data->>'ownerUserId' = c.data->>'ownerUserId' AND m.data->>'ruimte' = 'technisch')
                 THEN jsonb_build_object('mapId', NULL) ELSE '{}'::jsonb END
         || CASE WHEN COALESCE(c.data->>'workspaceId', '') <> '' AND NOT EXISTS (
                   SELECT 1 FROM app.records w
                    WHERE w.tbl = 'cloud_workspaces_v1' AND w.id = c.data->>'workspaceId'
                      AND w.data->>'ownerUserId' = c.data->>'ownerUserId' AND w.data->>'ruimte' = 'technisch')
                 THEN jsonb_build_object('workspaceId', '') ELSE '{}'::jsonb END
         || CASE WHEN COALESCE(c.data->>'suggestedWorkspaceId', '') <> '' AND NOT EXISTS (
                   SELECT 1 FROM app.records w
                    WHERE w.tbl = 'cloud_workspaces_v1' AND w.id = c.data->>'suggestedWorkspaceId'
                      AND w.data->>'ownerUserId' = c.data->>'ownerUserId' AND w.data->>'ruimte' = 'technisch')
                 THEN jsonb_build_object('suggestedWorkspaceId', '') ELSE '{}'::jsonb END,
       updated_at = now()
 WHERE c.tbl = 'cloud_items_v1'
   AND COALESCE(c.data->>'ownerUserId', '') <> ''
   AND starts_with(
         COALESCE(c.data->>'storagePath', ''),
         'cloud-technisch/' || left(encode(sha256(convert_to(c.data->>'ownerUserId', 'UTF8')), 'hex'), 18) || '/')
   AND COALESCE(c.data->>'ruimte', 'prive') <> 'technisch';

-- 2a. Persoonlijke virtuele fotorij van een technisch bestand dat de technische bibliotheek al kent: weg (geen tweede rij).
DELETE FROM app.records f
 USING app.records c
 WHERE f.tbl = 'foto_media_v1'
   AND COALESCE(f.data->>'ownerUserId', '') <> ''
   AND COALESCE(f.data->>'ruimte', 'prive') <> 'technisch'
   AND COALESCE(f.data->>'opslag', '') = 'cloud'
   AND c.tbl = 'cloud_items_v1' AND c.id = f.data->>'cloudItemId'
   AND c.data->>'ownerUserId' = f.data->>'ownerUserId' AND c.data->>'ruimte' = 'technisch'
   AND EXISTS (SELECT 1 FROM app.records t
                WHERE t.tbl = 'foto_media_v1' AND t.data->>'ruimte' = 'technisch'
                  AND t.data->>'ownerUserId' = f.data->>'ownerUserId' AND t.data->>'cloudItemId' = f.data->>'cloudItemId');

-- 2b. Een EIGEN persoonlijke foto die «indexeer» alleen aan het technische bestand koppelde: blijft, zonder koppeling en
--     zonder de herkomstregel(s) met de naam van dat bestand (indexeer schreef { bron: 'cloud', pad: originalName || title }).
UPDATE app.records f
   SET data = (f.data - 'cloudItemId') || jsonb_build_object('herkomst', COALESCE((
         SELECT jsonb_agg(e.h ORDER BY e.n)
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.data->'herkomst') = 'array' THEN f.data->'herkomst' ELSE '[]'::jsonb END)
                WITH ORDINALITY AS e(h, n)
          WHERE NOT (e.h->>'bron' = 'cloud' AND e.h->>'pad' = COALESCE(NULLIF(c.data->>'originalName', ''), c.data->>'title', ''))), '[]'::jsonb)),
       updated_at = now()
  FROM app.records c
 WHERE f.tbl = 'foto_media_v1'
   AND COALESCE(f.data->>'ownerUserId', '') <> ''
   AND COALESCE(f.data->>'ruimte', 'prive') <> 'technisch'
   AND COALESCE(f.data->>'opslag', '') <> 'cloud'
   AND c.tbl = 'cloud_items_v1' AND c.id = f.data->>'cloudItemId'
   AND c.data->>'ownerUserId' = f.data->>'ownerUserId' AND c.data->>'ruimte' = 'technisch'
   AND EXISTS (SELECT 1
                 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(f.data->'herkomst') = 'array' THEN f.data->'herkomst' ELSE '[]'::jsonb END) AS e(h)
                WHERE NOT (e.h->>'bron' = 'cloud' AND e.h->>'pad' = COALESCE(NULLIF(c.data->>'originalName', ''), c.data->>'title', '')));

-- 2c. Wat er nog over is (virtuele rij, of eigen kopie die alleen uit het technische bestand komt): naar de technische lade.
UPDATE app.records f
   SET data = f.data || jsonb_build_object('ruimte', 'technisch', 'albums', '[]'::jsonb),
       updated_at = now()
  FROM app.records c
 WHERE f.tbl = 'foto_media_v1'
   AND COALESCE(f.data->>'ownerUserId', '') <> ''
   AND COALESCE(f.data->>'ruimte', 'prive') <> 'technisch'
   AND c.tbl = 'cloud_items_v1' AND c.id = f.data->>'cloudItemId'
   AND c.data->>'ownerUserId' = f.data->>'ownerUserId' AND c.data->>'ruimte' = 'technisch';

-- 3a. (aantekening 4) Persoonlijke vNext-taak met het technische bestand als bron: weg.
DELETE FROM app.records t
 WHERE t.tbl = 'cloud_taken_v1'
   AND COALESCE(t.data->>'ownerUserId', '') <> ''
   AND COALESCE(t.data->>'ruimte', 'prive') <> 'technisch'
   AND t.data #>> '{bron,dienst}' = 'eigen'
   AND EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = t.data #>> '{bron,id}' AND c.data->>'ownerUserId' = t.data->>'ownerUserId' AND c.data->>'ruimte' = 'technisch');

-- 3b. Persoonlijke deelkoppeling die ALLEEN technische bestanden deelt: ingetrokken, naar de technische lade.
UPDATE app.cloud_deel_koppelingen k
   SET ruimte = 'technisch', ingetrokken_op = COALESCE(k.ingetrokken_op, now()), bijgewerkt_op = now()
 WHERE k.ruimte = 'prive'
   AND (
     (k.doel_soort IN ('bestand', 'bestand_deel', 'archief_pad') AND EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = k.doel_id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch'))
     OR (k.doel_soort = 'selectie'
         AND jsonb_typeof(k.bereik->'bestandIds') = 'array' AND jsonb_array_length(k.bereik->'bestandIds') > 0
         AND COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(k.bereik->'mapIds') = 'array' THEN k.bereik->'mapIds' END), 0) = 0
         AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(k.bereik->'bestandIds') AS b(id) WHERE NOT EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = b.id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch')))
   );

-- 3c. De statistiek (gebeurtenissen) gaat mee met haar koppeling.
UPDATE app.cloud_deel_gebeurtenissen g
   SET ruimte = 'technisch'
  FROM app.cloud_deel_koppelingen k
 WHERE g.koppeling_id = k.id AND k.ruimte = 'technisch' AND g.ruimte = 'prive';

-- 3d. Gemengde persoonlijke selectie: blijft, zonder de technische bestanden en zonder hun naam.
UPDATE app.cloud_deel_koppelingen k
   SET bereik = jsonb_set(k.bereik, '{bestandIds}', COALESCE((
         SELECT jsonb_agg(to_jsonb(b.id) ORDER BY b.n)
           FROM jsonb_array_elements_text(k.bereik->'bestandIds') WITH ORDINALITY AS b(id, n)
          WHERE NOT EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = b.id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch')), '[]'::jsonb)),
       doel_id = CASE WHEN EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = k.doel_id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch')
                      THEN COALESCE(k.bereik->'mapIds'->>0, (
                             SELECT b.id FROM jsonb_array_elements_text(k.bereik->'bestandIds') WITH ORDINALITY AS b(id, n)
                              WHERE NOT EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = b.id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch') ORDER BY b.n LIMIT 1), k.doel_id)
                      ELSE k.doel_id END,
       doel_naam = CASE WHEN EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = k.doel_id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch') THEN '' ELSE k.doel_naam END,
       naam = CASE WHEN EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = k.doel_id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch') AND k.naam = k.doel_naam THEN 'Вибір · Selectie' ELSE k.naam END,
       bijgewerkt_op = now()
 WHERE k.ruimte = 'prive' AND k.doel_soort = 'selectie'
   AND jsonb_typeof(k.bereik->'bestandIds') = 'array'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(k.bereik->'bestandIds') AS b(id) WHERE EXISTS (SELECT 1 FROM app.records c WHERE c.tbl = 'cloud_items_v1' AND c.id = b.id AND c.data->>'ownerUserId' = k.user_id AND c.data->>'ruimte' = 'technisch'));
