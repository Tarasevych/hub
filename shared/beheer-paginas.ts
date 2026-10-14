// Pagina's van gebruikersdiensten die eigenlijk sitebeheer zijn (audit 14.10.2026): ze blijven op hun adres, maar horen
// bij het technisch profiel, niet bij het account.
//
// Waarom zo (en niet anders):
//  - De adressen blijven (mcp.*/dashboard, /apps, /download en dashboard.* → mcp/dashboard): bladwijzers, runbooks en de
//    installatie-agent verwijzen ernaar. Verplaatsen naar admin.* zou een tweede kopie van dezelfde kaarten geven.
//  - Zichtbaarheid is ALLEEN weergave (zoals shared/weergave.ts): zonder actief technisch profiel verdwijnen de tabbladen uit
//    het menu en toont de pagina de poort «Управління сайтом». De rechten blijven op de server (eigenaarsroutes, beleid).
//  - Eén lijst, gedeeld door zijbalk (CanonicalChrome), tabbladen (UnifiedServiceApp) en de inhoud: anders raken ze uit de pas.
export const BEHEER_PAGINAS: Readonly<Record<string, readonly string[]>> = {
  // verbindingen (14.10.2026): AI-verbindingen van de TECHNISCHE ruimte (serverdeur, technische connector, agenttokens, agenten op de server).
  mcp: ['dashboard', 'apps', 'download', 'verbindingen'],
};

/** Een pagina van een gebruikersdienst die sitebeheer is (alleen in het technisch profiel). */
export const isBeheerPagina = (service: string, tab: string) => (BEHEER_PAGINAS[service] ?? []).includes(tab);

/** Zichtbaar in het huidige profiel: beheerpagina's alleen met actief technisch profiel. */
export const paginaZichtbaar = (service: string, tab: string, beheer: boolean) => beheer || !isBeheerPagina(service, tab);
