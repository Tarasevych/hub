// Клієнтські запити прикладної служби «Соціальні мережі» (CONSOL-001 / M4, 0320_social_overzicht_vlag.sql).
// Безпечний для серверного рендерингу (renderToStaticMarkup): не звертається до window чи location на рівні модуля.
import { api } from '../platform/client';

export type SocialNetwerkId =
  | 'telegram'
  | 'discord'
  | 'github'
  | 'mastodon'
  | 'bluesky'
  | 'linkedin'
  | 'youtube'
  | 'rss'
  | 'eigen';

export type SocialProfielStatus = 'actief' | 'gepauzeerd';
export type SocialBerichtStatus = 'concept' | 'gepland' | 'gepubliceerd' | 'gearchiveerd';

export type SocialProfiel = {
  id: string;
  netwerk: SocialNetwerkId;
  handvat: string;
  url: string;
  titel: string;
  inhoud: string;
  status: SocialProfielStatus;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type SocialBericht = {
  id: string;
  netwerk: SocialNetwerkId;
  handvat: string;
  url: string;
  titel: string;
  inhoud: string;
  status: SocialBerichtStatus;
  geplandOp: string | null;
  aangemaaktOp: string;
  bijgewerktOp: string;
};

export type SocialOverzichtData = {
  ruimte: 'prive' | 'technisch';
  magSchrijven: boolean;
  koppelingen: {
    telegram: {
      gekoppeld: boolean;
      aantal: number;
      kanalen: Array<{ id: string; naam: string; gebruikersnaam: string; stand: string; laatstGebruiktOp: string | null }>;
    };
    discord: {
      gekoppeld: boolean;
      aantal: number;
      accounts: Array<{ id: string; label: string; gekoppeldOp: string }>;
    };
    github: {
      gekoppeld: boolean;
      kluisGesloten: boolean;
      accounts: Array<{ pad: 'oauth' | 'app'; login: string; repoAantal: number; bijgewerktOp: number }>;
    };
  };
  fotoArchieven: {
    totaalMedia: number;
    totaalImports: number;
    perBron: Array<{ id: string; naam: readonly [string, string]; soort: string; aantal: number }>;
    recenteImports: Array<{ id: string; bron: string; archief: string; soort: string; nieuw: number; bekend: number; klaar: boolean; aangemaaktOp: string }>;
    recenteMedia: Array<{ id: string; titel: string; bron: string; genomenOp: string | null; toegevoegdOp: string }>;
  };
  profielen: SocialProfiel[];
  berichten: SocialBericht[];
  samenvatting: {
    actieveProfielen: number;
    concepten: number;
    gepland: number;
    gepubliceerd: number;
  };
};

export type SocialContextOpties = {
  service?: string;
  tabContext?: string;
  sourceOrigin?: string;
};

async function bouwEnvelop(ctx?: SocialContextOpties, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const origin = ctx?.sourceOrigin || (typeof location !== 'undefined' ? location.origin : 'https://id.tarasevych.com');
  let tab = ctx?.tabContext || '';
  if (!tab && typeof window !== 'undefined') {
    const mod = await import('../tab-context');
    tab = mod.ecosystemTabContext();
  }
  const service = ctx?.service || 'identity';
  return { service, tabContext: tab, sourceOrigin: origin, ...extra };
}

export async function laadSocialOverzicht(ctx?: SocialContextOpties): Promise<SocialOverzichtData> {
  const r = await api.post('/api/owner/social/overzicht', await bouwEnvelop(ctx));
  return r.data as SocialOverzichtData;
}

export async function bewaarSocialProfiel(
  invoer: { id?: string; netwerk: SocialNetwerkId; handvat: string; url: string; titel: string; inhoud: string; status: SocialProfielStatus },
  ctx?: SocialContextOpties,
): Promise<SocialProfiel> {
  const r = await api.post('/api/owner/social/profiel/opslaan', await bouwEnvelop(ctx, invoer));
  return (r.data as { profiel: SocialProfiel }).profiel;
}

export async function verwijderSocialProfiel(id: string, ctx?: SocialContextOpties): Promise<void> {
  await api.post('/api/owner/social/profiel/verwijderen', await bouwEnvelop(ctx, { id }));
}

export async function bewaarSocialBericht(
  invoer: { id?: string; netwerk: SocialNetwerkId; handvat: string; url: string; titel: string; inhoud: string; status: SocialBerichtStatus; geplandOp?: string | null },
  ctx?: SocialContextOpties,
): Promise<SocialBericht> {
  const r = await api.post('/api/owner/social/bericht/opslaan', await bouwEnvelop(ctx, invoer));
  return (r.data as { bericht: SocialBericht }).bericht;
}

export async function verwijderSocialBericht(id: string, ctx?: SocialContextOpties): Promise<void> {
  await api.post('/api/owner/social/bericht/verwijderen', await bouwEnvelop(ctx, { id }));
}
