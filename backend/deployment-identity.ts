// ============================================================================
// SINGLE SOURCE OF TRUTH for this deployment's AppDeploy App ID.
//
// When migrating this codebase to a different AppDeploy app (new provider,
// new account, disaster recovery, etc.), this is the ONLY line that should
// ever need to change. Every other file imports TECH_ORIGIN / API_COOKIE_PATH
// / ECOSYSTEM_COOKIE / REDIRECT_COOKIE from here instead of hardcoding the
// app id or the *.v2.appdeploy.ai domain themselves.
//
// scripts/l002-audit.mjs enforces this: the build fails if the literal
// string '.v2.appdeploy.ai' appears anywhere outside this file. If you add
// a new file that needs the technical origin, import it from here — do not
// write the domain out by hand.
// ============================================================================
export const APP_ID = 'migrated-bg2v4h';

export const TECH_ORIGIN = `https://${APP_ID}.v2.appdeploy.ai`;
export const API_COOKIE_PATH = `/app/${APP_ID}/`;
export const ECOSYSTEM_COOKIE = `__Secure-tsv_ecosystem_${APP_ID}`;
export const REDIRECT_COOKIE = `__Secure-tsv_redirect_${APP_ID}`;
