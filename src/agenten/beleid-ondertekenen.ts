// Ter-plaatse Passkey-ondertekening van het AI-beleid («Доступ ШІ») op #agent/<slug> (UX-AI-VAULT-001).
// Gebruikt exact dezelfde WYSIWYS-hashcontrole (canonicalize → sha256 → mijn-ruimte-goedkeuring/v1) en WebAuthn-stroom
// als src/BeheerAiBeleidWeergave.tsx, zodat de eigenaar op mcp.tarasevych.com/agenten#agent/<slug> zonder blinde
// omleiding naar admin.tarasevych.com/ai een agent kan toevoegen / inschakelen en zijn mogelijkheden ondertekenen.
import { sessionBody } from '../agenten-gegevens';
import { sessieDienst } from '../canoniek-navigatie';
import { foutCode, passkeyBevestigen, type AssertieOpties } from '../platform/webauthn';
import { api } from '../platform/client';
import { verwachteUitdaging, deelFoutTekst } from '../BeheerAiBeleidWeergave';
import { bouwAgentBeleidOps } from '../../shared/ai-beleid/agent-ontwerp';
import type { Policy } from '../../shared/ai-beleid/model';
import type { AgentSlug } from '../../shared/connector-v2/agenten';

type OverzichtKort = {
  staat: 'niet-ingesteld' | 'ongeldig' | 'geldig';
  code?: string;
  serverNow: number;
  beleid?: Policy;
  verbindingen?: Array<{ naam: string; soort: string; actief: boolean; agentId: string | null }>;
};

type VoorstelKort = {
  uitdagingId: string;
  verloopt: number;
  nonce: string;
  beleidHash: string;
  ontwerp: Policy;
  publicKey: AssertieOpties;
};

export type OndertekenAgentBeleidUitkomst =
  | { nodig: false; getekend: false; staat: 'niet-ingesteld' | 'al-toegestaan' }
  | { nodig: true; getekend: true; seq: number };

export async function ondertekenAgentBeleidInPlaats(opties: {
  slug: AgentSlug;
  naam: string;
  sleutels: readonly string[];
  lang: 'uk' | 'nl';
}): Promise<OndertekenAgentBeleidUitkomst> {
  const ctx = sessionBody(sessieDienst());
  let ov: OverzichtKort;
  try {
    ov = (await api.post('/api/owner/ai-beleid/overzicht', ctx)).data as OverzichtKort;
  } catch (e) {
    throw new Error(deelFoutTekst(opties.lang, 'overzicht', foutCode(e)));
  }

  if (ov.staat === 'niet-ingesteld' || !ov.beleid) {
    return { nodig: false, getekend: false, staat: 'niet-ingesteld' };
  }
  if (ov.staat === 'ongeldig') {
    throw new Error(deelFoutTekst(opties.lang, 'overzicht', 'BELEID_KETEN_ONGELDIG'));
  }

  const naamLaag = opties.naam.toLowerCase();
  const slugLaag = opties.slug.toLowerCase();
  const gekoppeldId = (ov.verbindingen ?? []).find(
    (v) => v.agentId && (v.naam.toLowerCase().includes(slugLaag) || v.naam.toLowerCase().includes(naamLaag) || v.agentId.toLowerCase() === slugLaag),
  )?.agentId ?? (ov.beleid.agents[opties.slug] ? opties.slug : null);

  const ops = bouwAgentBeleidOps(ov.beleid, opties.slug, opties.naam, opties.sleutels, {
    bestaandeAgentId: gekoppeldId,
    nu: ov.serverNow || Date.now(),
  });
  if (!ops.length) {
    return { nodig: false, getekend: false, staat: 'al-toegestaan' };
  }

  let voorstel: VoorstelKort;
  try {
    voorstel = (await api.post('/api/owner/ai-beleid/voorstel', { ...ctx, ops })).data as VoorstelKort;
    const eigen = await verwachteUitdaging(voorstel.ontwerp, voorstel.nonce, voorstel.verloopt);
    if (eigen.challenge !== voorstel.publicKey.challenge || eigen.hash !== voorstel.beleidHash) {
      throw Object.assign(new Error('UITDAGING_ANDERS'), { message: 'UITDAGING_ANDERS' });
    }
  } catch (e) {
    throw new Error(deelFoutTekst(opties.lang, 'voorstel', foutCode(e)));
  }

  try {
    const assertie = await passkeyBevestigen(voorstel.publicKey);
    const r = await api.post('/api/owner/ai-beleid/ondertekenen', {
      ...ctx,
      uitdagingId: voorstel.uitdagingId,
      ontwerp: voorstel.ontwerp,
      assertie,
    });
    const uit = r.data as { resultaat: string; code: string | null; uk: string | null; nl: string | null; seq: number };
    if (uit.resultaat === 'geweigerd') {
      throw new Error(opties.lang === 'uk' ? (uit.uk || uit.code || 'Сервер відхилив зміну.') : (uit.nl || uit.code || 'De server weigerde de wijziging.'));
    }
    return { nodig: true, getekend: true, seq: uit.seq };
  } catch (e) {
    const code = foutCode(e);
    if (code && !code.includes(' ') && code.length < 48) {
      throw new Error(deelFoutTekst(opties.lang, 'ondertekenen', code));
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}
