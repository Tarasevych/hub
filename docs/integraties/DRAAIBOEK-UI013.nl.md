> 🌐 **Taal / Мова:** [Українська](ІНСТРУКЦІЯ-УІ013.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# UI-013, eerste etappe: nieuwe integratiecatalogus

## Wat het is
De pagina «Інтеграції» (Integraties) in het beheerpaneel kan diensten nu per thema tonen (Mail, Kalender, Opslag, enz.). Binnen elk thema zijn de diensten
ingedeeld naar hun werkelijke stand:
- **Потребують уваги (Vragen aandacht)** — er is een koppeling, maar met een fout. Zulke diensten staan altijd bovenaan.
- **Під'єднані (Gekoppeld)** — de server ziet de koppeling.
- **Можна під'єднати (Klaar om te koppelen)** — het koppelen werkt al op de site en kan meteen worden uitgevoerd.
- **Потребують налаштування (Instellen nodig)** — de basis is er, maar er ontbreken sleutels of instellingen.
- **У розробці (In ontwikkeling)** — nog niet gebouwd. In plaats van «Скоро» (Binnenkort) is er nu de knop «План» (Plan): wat er nodig is en wat er nog moet gebeuren.

Geen enkele van de 160 kaarten is verwijderd.

## Wat direct is opgelost (zonder vlag)
- De melding «Стан Google-під'єднань не вдалося прочитати» (De stand van Google-koppelingen kon niet worden gelezen). De pagina las de Google-stand via de grote diagnostiek, die ook
  mailadressen op het internet controleert. Als één onderdeel faalde, viel alles om. Nu wordt de Google-stand apart en snel gelezen. Als er toch
  een fout optreedt, verschijnt de foutcode ernaast.
- IMAP-mailboxen (iCloud, Yahoo, Ukr.net, enz.) die u hebt gekoppeld in «Пошта → Облікові записи» (Mail → Accounts), zijn nu in de catalogus zichtbaar als gekoppeld.

## Hoe in te schakelen
Beheerpaneel → vlaggen → «Новий каталог інтеграцій (теми й групи)» (`integraties-catalogus-v2`) → inschakelen voor uzelf.
Uitschakelen gaat op dezelfde manier; dan keert de oude catalogus terug.

## Controle (zet bij elk punt «werkt» of «werkt niet»)
1. Zet de vlag aan en open «Інтеграції» → «Каталог». U ziet de kop «Каталог за темами» en één «?» ernaast.
2. De thema's staan onder elkaar. Klik op de naam van een thema en het klapt in. Klik nogmaals en het klapt weer uit.
3. Klap een thema en een groep in, en ververs de pagina. Ze blijven ingeklapt.
4. De groep «У розробці» is vanaf het begin ingeklapt, terwijl «Під'єднані» en «Можна під'єднати» uitgeklapt zijn.
5. Gmail (indien gekoppeld) staat in het thema «Пошта» in de groep «Під'єднані», boven de andere.
6. De melding «Стан Google-під'єднань не вдалося прочитати» verschijnt niet meer. Mocht ze toch verschijnen, stuur mij dan de code die ernaast staat.
7. Als u een IMAP-mailbox hebt (bijvoorbeeld iCloud), staat die in de groep «Під'єднані» en staat op de kaart het tijdstip van de laatste controle.
8. Klik op een kaart in «У розробці» (bijvoorbeeld Slack) op «План». Er opent een venster met wat er nodig is en wat er nog moet gebeuren. De knop «Скоро» is weg.
9. De knop «Під'єднати» op IMAP / SMTP leidt naar «Пошта → Облікові записи».
10. Zoeken: typ «календар» of «WebDAV», en de bijbehorende diensten verschijnen.
11. Kies een thema in de lijst «Усі теми» en de wijze «OAuth», en ververs de pagina. De keuze blijft bewaard.
12. Wissel tussen «Сітка / Список» (Raster / Lijst) en ververs de pagina. De weergave blijft bewaard.
13. Het sterretje op een kaart zet haar bovenaan in «Обране» (Favorieten), maar de kaart blijft ook in haar eigen thema staan.
14. Open de catalogus in twee tabbladen en klik in één tabblad op «Оновити стан» (Stand vernieuwen). Het tweede tabblad vernieuwt ook.
15. Telefoon: alles past in de breedte, knoppen zijn goed bruikbaar, het lichte en donkere thema zijn goed leesbaar.
16. Zet de vlag uit, en de oude catalogus is weer precies zoals voorheen.

## Wat er nog niet is (volgende etappes)
- Stapsgewijze koppelwizard (kiezen → wijze → aanmelden → controle → rechten → klaar).
- Dezelfde catalogus op de pagina's van Mail, Cloud, Foto's, Kalender, AI, Slim huis en GitHub.
- Nieuwe koppelingen: Nextcloud, S3, MQTT, Outlook. Voor OneDrive, Dropbox en Box zijn sleutels van die diensten nodig die u zelf moet aanleveren.
- Automatische periodieke controle van koppelingen volgens schema.

Niets uitgerold en niets op de site geïnstalleerd.

---

# Etappe 2 (UI-013 fase 2): hoe te controleren

Alles wat nieuw is werkt alleen met de vlag `integraties-catalogus-v2`. Zonder die vlag werkt alles zoals voorheen.

1. Zet de vlag aan en open Admin → Catalogi. Bovenaan staat de knop «Майстер під'єднань» (Koppelwizard).
2. Klik erop. U ziet 6 stappen: kiezen → wijze → aanmelden → controle → rechten → klaar.
3. Kies «Nextcloud». U ziet de wijze «WebDAV» en wat er nodig is: adres en app-wachtwoord.
4. Voer een adres (alleen `https://`) en een app-wachtwoord in. Klik op «Перевірити» (Controleren). Het wachtwoord wordt nergens opgeslagen en verdwijnt na de controle uit het veld.
5. Verkeerd wachtwoord: u ziet een duidelijke foutmelding en de knop «Перевірити ще раз» (Opnieuw controleren).
6. Stap «Дозволи» (Rechten): er staat vermeld dat AI-agenten geen automatische toegang krijgen.
7. Voor Gmail of Google Drive opent de wizard de al bestaande Google-aanmeldpagina. Er komt geen nieuw aanmeldscherm bij.
8. «Скасувати» (Annuleren) of «Назад» (Terug) werken bij elke stap.
9. Open Cloud → Accounts, Foto's, Kalender, Mail → Accounts, Huis → Integraties, GitHub → Accounts, AI → Verbindingen. Bovenaan staat de strook «Що можна під'єднати тут» (Wat u hier kunt koppelen) met één «?» en de knop «Увесь каталог» (Hele catalogus).
10. De badge op de strook toont alleen de gereedheid in de catalogus, niet de stand van uw account.
11. Cloud → Accounts: bij elke dienst staat ook een badge «Каталог: …». Bij Nextcloud staat «є перевірка з'єднання» (verbindingscontrole aanwezig).
12. De catalogus controleert verbindingen zelf hoogstens één keer per uur zolang hij openstaat. De server staat dit hoogstens één keer per 30 minuten toe. Er wordt niets naar externe diensten geschreven.
13. Als de laatste controle meer dan 24 uur geleden was, staat op de kaart «Перевірка застаріла (понад добу)» (Controle verouderd, ouder dan een dag).
14. Telefoon, licht en donker thema: knoppen zijn groot, alles is goed leesbaar.

Nextcloud, S3 en MQTT controleren voorlopig alleen de verbinding. Daarom staan ze onder «Потребують налаштування» en niet onder «Працює».
Outlook: vereist sleutels van de eigenaar.

Niets uitgerold.
