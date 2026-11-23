> 🌐 **Taal:** [Українська](КОНСОЛІДАЦІЯ-ФОТО.uk.md) · **Nederlands**

# Consolidatie van de dienst «Foto’s»: rechtstreekse weergave uit Google Drive en WebDAV

## 1. Doel en afbakening

Dit document beschrijft de afronding van de dienst «Foto’s» (taak **Z-14**, migratie `0318_foto_dienst_afwerking.sql`):

1. Rechtstreeks en veilig indexeren en bekijken van foto’s en video’s uit gekoppelde **Google Drive** en uit gekoppelde **Nextcloud**- en **NAS**-opslag (via beveiligde WebDAV), uitsluitend na uitdrukkelijke toestemming van de gebruiker binnen de actieve ruimte (`prive` of `technisch`).
2. Behoud van eerlijke tweetalige toelichtingen voor opslagdiensten zonder open webprotocol (**iCloud**, **Proton Drive**) zonder misleidende koppelknoppen.

## 2. Toestemmingstabel en functievlag (migratie 0318)

| Onderdeel | Identificatie | Beveiliging en regels |
| --- | --- | --- |
| Toestemmingstabel | `app.foto_externe_bronnen` | Sleutel `(user_id, ruimte, bron)`, `ENABLE` + `FORCE ROW LEVEL SECURITY` per eigenaar en ruimte |
| Functievlag | `foto-google-drive-v1` | Geregistreerd met `aan = false, standaard = false` conform **VLAG-001** |
| Client-wrappers | `src/foto/foto-vlaggen.ts`, `src/cloud-vnext/cloud-vlag.ts` | Directe statusvernieuwing in het tabblad bij `mr:vlaggen-vernieuwd` |

## 3. Gegevensstroom en privacywaarborgen

1. **Uitdrukkelijke toestemming per ruimte:** de serverroute `POST /api/owner/foto/indexeer` met `bron: 'google-drive' | 'nextcloud' | 'nas'` vereist altijd `toestemming: true` en schrijfrecht `photos.write`. Zonder toestemming volgt `400 TOESTEMMING_VEREIST`; er vindt nooit een stille achtergrondscan plaats.
2. **Virtuele opname zonder dubbele opslag:** mediabestanden uit de Google Drive-projectie of de gekoppelde WebDAV-map binnen dezelfde lade worden in `foto_media_v1` geregistreerd als bronverwijzing zonder verplichte kopie op de serverschijf. De gebruiker kan desgewenst een eigen kopie bewaren met de actie `kopieer`.
3. **Strikte ruimtescheiding:** de persoonlijke (`prive`) en technische (`technisch`) ruimte hebben gescheiden toestemmingen en gescheiden bibliotheekregels; geen enkel item lekt naar een andere ruimte of een andere gebruiker.
4. **Onaantastbaarheid van externe originelen:** loskoppelen uit de bibliotheek verwijdert alleen de verwijzing in `foto_media_v1`; bestanden op Google Drive, Nextcloud of NAS worden nooit gewijzigd of gewist.

## 4. Toetsing aan de 15 vragen van architectuur «Klimop» (KLIMOP-001)

- Leesrechten voor externe fotobronnen zijn per ruimte en bron gescheiden; bij ontbrekende of ingetrokken cloudkoppeling stopt het lezen van bytes direct zonder schade aan de bibliotheek.
- Bestandsgrootte- en tijdslimieten beschermen het geheugen en de opslag van de server tegen overbelasting.
