export const CANONICAL_AUTH_CHANGE='canonical-auth-change';
export const broadcastCanonicalAuthChange=()=>window.dispatchEvent(new Event(CANONICAL_AUTH_CHANGE));
