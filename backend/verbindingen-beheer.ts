// CONSOL-001 (Блок Б, З-5): справжні дії керування хмарними підключеннями у Центрі підключень (VerbindingenCentrum):
// жива перевірка стану, вибір основного облікового запису Google Drive та розірвання зв’язку з обов’язковим підтвердженням.
// Echte beheeracties voor VerbindingenCentrum: status controleren, standaard Drive-account kiezen en veilig loskoppelen per ruimte.
import { randomUUID } from 'node:crypto';
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { journaalSchrijf } from './beheer-journaal';
import { cloudSchrijfWeigering } from './cloud-schrijfrecht';
import {
  CloudConnectionError,
  CloudConnectionManager,
  type CloudConnectionStore,
  type CloudPrincipal,
  type OAuthConfig,
  type OAuthProvider,
  type ProviderOAuthClient,
} from './cloud-verbinding-m4';
import { CALLBACK_PATH, cloudOAuthM4Config } from './cloud-verbinding-m4-config';
import { PostgresCloudConnections } from './cloud-verbinding-m4-pg';
import { LiveOAuthProviders } from './cloud-verbinding-m4-providers';
import { syncFeiten } from './cloud-vnext-integraties';
import {
  googleSuiteDisconnectDriveAccount,
  googleSuiteDrivePlatformStatus,
  googleSuiteDriveProviderSnapshot,
  googleSuiteSelectDriveAccount,
} from './google-suite-inrichting';
import { denyMutation, rejectForeignOwnerUserId } from './rbac';
import { huidigeLadeContext, ladeOf, metLade } from './ruimte-cloud-agenda';
import { gegevensLade, gegevensRuimteVeilig } from './ruimte-scheiding';

type SessionUser = { id: string; email?: string; name?: string; role?: string; status?: string; accessLevel?: string };
type SessionOk = { user: SessionUser; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;

const TOEGESTANE_DIENSTEN = ['cloud', 'hub'] as const;

export type VerbindingenBeheerOpties = {
  vlagAan?: (u: SessionUser) => Promise<boolean>;
  m4Store?: CloudConnectionStore;
  m4Providers?: ProviderOAuthClient & {
    refresh?: (p: OAuthProvider, c: OAuthConfig, current: { accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[] }) => Promise<{ accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[] }>;
  };
  m4Config?: (provider: OAuthProvider) => OAuthConfig;
};

function veiligeM4Config(provider: OAuthProvider): OAuthConfig {
  try {
    return cloudOAuthM4Config(provider);
  } catch {
    const prefix = provider.startsWith('onedrive') || provider === 'sharepoint'
      ? 'CLOUD_MICROSOFT'
      : provider === 'dropbox'
        ? 'CLOUD_DROPBOX'
        : 'CLOUD_BOX';
    return {
      clientId: String(process.env[`${prefix}_CLIENT_ID`] || ''),
      clientSecret: String(process.env[`${prefix}_CLIENT_SECRET`] || ''),
      redirectUri: `https://cloud.tarasevych.com${CALLBACK_PATH}`,
    };
  }
}

const schoon = (v: unknown, max = 200): string =>
  String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

async function binnenCloudRuimte<T>(
  user: SessionUser,
  tabContext: string | null,
  werk: (ruimte: 'prive' | 'technisch') => Promise<T>,
): Promise<{ ok: true; waarde: T } | { ok: false; antwoord: Resp }> {
  const ctx = huidigeLadeContext();
  if (ctx && ctx.lade.userId === user.id) {
    return { ok: true, waarde: await werk(ctx.lade.ruimte) };
  }
  const ruimte = await gegevensRuimteVeilig(user.id, { tabContext });
  if (ruimte === 'technisch') {
    const besluit = await gegevensLade({ userId: user.id, rol: user.role, tabContext, dienst: 'cloud' });
    if (!besluit.ok) {
      return { ok: false, antwoord: json({ error: besluit.code, uitleg: besluit.uitleg }, 403) };
    }
  }
  const waarde = await metLade({ userId: user.id, ruimte }, 'cloud', () => werk(ruimte));
  return { ok: true, waarde };
}

export function verbindingenBeheerRoutes(
  requireSession: RequireSession,
  opties: VerbindingenBeheerOpties = {},
): Record<string, RouterMiddleware[]> {
  const store = opties.m4Store ?? new PostgresCloudConnections();
  const providers = opties.m4Providers ?? new LiveOAuthProviders();
  const configFn = opties.m4Config ?? veiligeM4Config;
  const manager = new CloudConnectionManager(store, providers, configFn);

  const route = (
    pad: string,
    schrijvend: boolean,
    run: (b: Record<string, unknown>, auth: SessionOk, ruimte: 'prive' | 'technisch') => Promise<Resp>,
  ): RouterMiddleware[] => [
    (async (raw: unknown) => {
      const ctx = raw as Ctx;
      const auth = await requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
      if (!(TOEGESTANE_DIENSTEN as readonly string[]).includes(auth.service) || auth.user.status !== 'approved') {
        return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
      }
      if (opties.vlagAan) {
        const aan = await opties.vlagAan(auth.user).catch(() => false);
        if (!aan) return error('CLOUD_VNEXT_UIT', 404);
      }
      const b = ctx.body && typeof ctx.body === 'object' ? (ctx.body as Record<string, unknown>) : {};
      const vreemd = rejectForeignOwnerUserId(auth.user as never, b);
      if (vreemd) return vreemd;

      const tabContext = typeof b.tabContext === 'string' ? b.tabContext : null;
      const uit = await binnenCloudRuimte(auth.user, tabContext, async (ruimte) => {
        if (schrijvend) {
          const mutatieWeigering = denyMutation(auth.user as never, 'cloud.write');
          if (mutatieWeigering) {
            const w = await cloudSchrijfWeigering(auth.user, pad);
            return w || mutatieWeigering;
          }
        }
        return run(b, auth, ruimte);
      });
      return uit.ok ? uit.waarde : uit.antwoord;
    }) as RouterMiddleware,
  ];

  return {
    'POST /api/owner/verbindingen/controleer': route('POST /api/owner/verbindingen/controleer', false, async (b, auth, ruimte) => {
      const soort = schoon(b.soort, 40) || 'google';
      const accountId = schoon(b.accountId, 200);
      if (!accountId) return error('ACCOUNT_ID_VEREIST', 400);

      if (soort === 'google') {
        const [platform, snapshots, feiten] = await Promise.all([
          googleSuiteDrivePlatformStatus(true),
          googleSuiteDriveProviderSnapshot(auth.user.id),
          syncFeiten(auth.user.id),
        ]);
        const google = (snapshots as Array<{ id: string; accounts?: Array<{ id: string; email: string; status: string }>; activeAccountId?: string }>)
          .find((s) => s.id === 'google');
        const gevonden = google?.accounts?.find((a) => a.id === accountId);
        if (!gevonden) return error('CLOUD_GOOGLE_ACCOUNT_NOT_FOUND', 404);
        const sync = feiten.get(accountId) || null;
        const stand = gevonden.status === 'connected' && !sync?.herstelNodig && !sync?.foutCode ? 'ok' : 'aandacht';
        await journaalSchrijf({
          actie: 'owner.cloud.verbinding.gecontroleerd',
          actor: auth.user.id,
          eigenaar: auth.user.id,
          resultaat: stand === 'ok' ? 'success' : 'failure',
          doel: { soort: 'cloud-verbinding', id: accountId, naam: 'Google Drive' },
          details: { ruimte, soort: 'google', status: gevonden.status, platformConfigured: Boolean((platform as { configured?: boolean })?.configured) },
        }).catch(() => undefined);
        return json({
          ok: true,
          soort: 'google',
          accountId,
          ruimte,
          stand,
          status: gevonden.status,
          actief: google?.activeAccountId === accountId,
          gecontroleerdOp: Date.now(),
        });
      }

      if (soort === 'm4') {
        const principal: CloudPrincipal = { owner: auth.user.id, space: ruimte || ladeOf(auth.user.id).ruimte };
        const lijst = await store.list(principal).catch(() => []);
        const publiek = lijst.find((a) => a.id === accountId);
        if (!publiek) return error('CLOUD_ACCOUNT_NOT_FOUND', 404);

        const cfg = configFn(publiek.provider);
        if (!cfg.clientId || !cfg.clientSecret) {
          await journaalSchrijf({
            actie: 'owner.cloud.verbinding.gecontroleerd',
            actor: auth.user.id,
            eigenaar: auth.user.id,
            resultaat: 'info',
            doel: { soort: 'cloud-verbinding', id: accountId, naam: publiek.provider },
            reden: 'SLEUTELS_ONTBREKEN',
            details: { ruimte: principal.space, soort: 'm4', provider: publiek.provider },
          }).catch(() => undefined);
          return json({
            ok: false,
            soort: 'm4',
            accountId,
            ruimte: principal.space,
            stand: 'aandacht',
            code: 'SLEUTELS_ONTBREKEN',
            status: publiek.status,
            gecontroleerdOp: Date.now(),
          });
        }

        let opgeslagen;
        try {
          opgeslagen = await store.get(principal, accountId);
        } catch (e) {
          const code = e instanceof CloudConnectionError ? e.code : 'CLOUD_GRANT_ONLEESBAAR';
          return json({
            ok: false,
            soort: 'm4',
            accountId,
            ruimte: principal.space,
            stand: 'aandacht',
            code,
            status: publiek.status,
            gecontroleerdOp: Date.now(),
          });
        }
        if (!opgeslagen) return error('CLOUD_ACCOUNT_NOT_FOUND', 404);

        let accessToken = opgeslagen.credentials.accessToken;
        if (opgeslagen.credentials.expiresAt <= Date.now() + 30_000) {
          if (!opgeslagen.credentials.refreshToken || typeof providers.refresh !== 'function') {
            await store.setStatus(principal, accountId, 'reauth_required').catch(() => undefined);
            return json({
              ok: false,
              soort: 'm4',
              accountId,
              ruimte: principal.space,
              stand: 'aandacht',
              code: 'HERAUTORISATIE_VEREIST',
              status: 'reauth_required',
              gecontroleerdOp: Date.now(),
            });
          }
          const pgStore = store as PostgresCloudConnections;
          const lease = randomUUID();
          const heeftLease = typeof pgStore.tryRefreshLease === 'function'
            ? await pgStore.tryRefreshLease(principal, accountId, lease)
            : true;
          if (heeftLease) {
            try {
              const vers = await providers.refresh(opgeslagen.provider, cfg, opgeslagen.credentials);
              if (typeof pgStore.commitRefreshed === 'function') {
                await pgStore.commitRefreshed(principal, accountId, lease, vers);
              }
              accessToken = vers.accessToken;
            } catch {
              if (typeof pgStore.failedRefresh === 'function') {
                await pgStore.failedRefresh(principal, accountId, lease).catch(() => undefined);
              } else {
                await store.setStatus(principal, accountId, 'reauth_required').catch(() => undefined);
              }
              await journaalSchrijf({
                actie: 'owner.cloud.verbinding.gecontroleerd',
                actor: auth.user.id,
                eigenaar: auth.user.id,
                resultaat: 'failure',
                doel: { soort: 'cloud-verbinding', id: accountId, naam: opgeslagen.provider },
                reden: 'HERAUTORISATIE_VEREIST',
                details: { ruimte: principal.space, soort: 'm4', provider: opgeslagen.provider },
              }).catch(() => undefined);
              return json({
                ok: false,
                soort: 'm4',
                accountId,
                ruimte: principal.space,
                stand: 'aandacht',
                code: 'HERAUTORISATIE_VEREIST',
                status: 'reauth_required',
                gecontroleerdOp: Date.now(),
              });
            }
          }
        }

        try {
          await providers.identity(opgeslagen.provider, accessToken);
          if (opgeslagen.status !== 'connected') {
            await store.setStatus(principal, accountId, 'connected').catch(() => undefined);
          }
          await journaalSchrijf({
            actie: 'owner.cloud.verbinding.gecontroleerd',
            actor: auth.user.id,
            eigenaar: auth.user.id,
            resultaat: 'success',
            doel: { soort: 'cloud-verbinding', id: accountId, naam: opgeslagen.provider },
            details: { ruimte: principal.space, soort: 'm4', provider: opgeslagen.provider },
          }).catch(() => undefined);
          return json({
            ok: true,
            soort: 'm4',
            accountId,
            ruimte: principal.space,
            stand: 'ok',
            status: 'connected',
            gecontroleerdOp: Date.now(),
          });
        } catch {
          await store.setStatus(principal, accountId, 'reauth_required').catch(() => undefined);
          await journaalSchrijf({
            actie: 'owner.cloud.verbinding.gecontroleerd',
            actor: auth.user.id,
            eigenaar: auth.user.id,
            resultaat: 'failure',
            doel: { soort: 'cloud-verbinding', id: accountId, naam: opgeslagen.provider },
            reden: 'CONTROLE_MISLUKT',
            details: { ruimte: principal.space, soort: 'm4', provider: opgeslagen.provider },
          }).catch(() => undefined);
          return json({
            ok: false,
            soort: 'm4',
            accountId,
            ruimte: principal.space,
            stand: 'aandacht',
            code: 'HERAUTORISATIE_VEREIST',
            status: 'reauth_required',
            gecontroleerdOp: Date.now(),
          });
        }
      }

      return error('SOORT_ONBEKEND', 400);
    }),

    'POST /api/owner/verbindingen/selecteer': route('POST /api/owner/verbindingen/selecteer', true, async (b, auth, ruimte) => {
      const accountId = schoon(b.accountId, 200);
      if (!accountId) return error('ACCOUNT_ID_VEREIST', 400);
      const account = await googleSuiteSelectDriveAccount(auth.user.id, accountId);
      if (!account) return error('CLOUD_GOOGLE_CONNECTED_ACCOUNT_REQUIRED', 404);
      await journaalSchrijf({
        actie: 'owner.cloud.verbinding.gecontroleerd',
        actor: auth.user.id,
        eigenaar: auth.user.id,
        resultaat: 'success',
        doel: { soort: 'cloud-verbinding', id: accountId, naam: 'Google Drive' },
        wijziging: { naar: 'standaard-account' },
        details: { ruimte, soort: 'google' },
      }).catch(() => undefined);
      return json({ ok: true, ruimte, activeAccount: account });
    }),

    'POST /api/owner/verbindingen/loskoppelen': route('POST /api/owner/verbindingen/loskoppelen', true, async (b, auth, ruimte) => {
      if (b.bevestig !== true) return error('BEVESTIGING_VEREIST', 400);
      const soort = schoon(b.soort, 40) || 'google';
      const accountId = schoon(b.accountId, 200);
      if (!accountId) return error('ACCOUNT_ID_VEREIST', 400);

      if (soort === 'google') {
        try {
          const uit = await googleSuiteDisconnectDriveAccount(auth.user.id, {
            accountId,
            confirmation: 'DISCONNECT_GOOGLE_DRIVE',
            retainLocalCopies: true,
          });
          await journaalSchrijf({
            actie: 'owner.cloud.verbinding.ontkoppeld',
            actor: auth.user.id,
            eigenaar: auth.user.id,
            resultaat: 'success',
            doel: { soort: 'cloud-verbinding', id: accountId, naam: 'Google Drive' },
            reden: 'op verzoek van de gebruiker',
            details: { ruimte, soort: 'google', retainLocalCopies: true },
          }).catch(() => undefined);
          return json({ ok: true, soort: 'google', accountId, ruimte, ...uit });
        } catch (caught) {
          const reden = caught instanceof Error ? caught.message : 'CLOUD_GOOGLE_DISCONNECT_FAILED';
          const status = reden === 'CLOUD_GOOGLE_DISCONNECT_CONFIRMATION_REQUIRED'
            ? 400
            : reden === 'CLOUD_LOCAL_COPY_DELETION_NOT_AVAILABLE'
              ? 409
              : reden === 'CLOUD_GOOGLE_ACCOUNT_NOT_FOUND'
                ? 404
                : 500;
          return error(reden, status);
        }
      }

      if (soort === 'm4') {
        const principal: CloudPrincipal = { owner: auth.user.id, space: ruimte || ladeOf(auth.user.id).ruimte };
        try {
          const uit = await manager.disconnect(principal, accountId);
          await journaalSchrijf({
            actie: 'owner.cloud.verbinding.ontkoppeld',
            actor: auth.user.id,
            eigenaar: auth.user.id,
            resultaat: 'success',
            doel: { soort: 'cloud-verbinding', id: accountId, naam: 'm4-cloud' },
            reden: 'op verzoek van de gebruiker',
            details: { ruimte: principal.space, soort: 'm4', remote: uit.remote },
          }).catch(() => undefined);
          return json({ ok: true, soort: 'm4', accountId, ruimte: principal.space, ...uit });
        } catch (caught) {
          if (caught instanceof CloudConnectionError && (caught.code === 'CLOUD_M4_ENCRYPTION_KEY_MISSING' || caught.code === 'CLOUD_M4_ENCRYPTION_KEY_INVALID' || caught.code === 'CLOUD_GRANT_DECRYPT_FAILED')) {
            try {
              await store.setStatus(principal, accountId, 'revoked');
              await journaalSchrijf({
                actie: 'owner.cloud.verbinding.ontkoppeld',
                actor: auth.user.id,
                eigenaar: auth.user.id,
                resultaat: 'success',
                doel: { soort: 'cloud-verbinding', id: accountId, naam: 'm4-cloud' },
                reden: 'lokaal ingetrokken zonder serversleutel',
                details: { ruimte: principal.space, soort: 'm4', remote: 'unsupported' },
              }).catch(() => undefined);
              return json({ ok: true, soort: 'm4', accountId, ruimte: principal.space, localDisabled: true, remote: 'unsupported' });
            } catch (inner) {
              if (inner instanceof CloudConnectionError) return error(inner.code, inner.status);
            }
          }
          if (caught instanceof CloudConnectionError) return error(caught.code, caught.status);
          return error('CLOUD_DISCONNECT_MISLUKT', 502);
        }
      }

      return error('SOORT_ONBEKEND', 400);
    }),
  };
}
