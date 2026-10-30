// Accountclaim voor de browserextensie (0.4): <meta name="mjn-account" content="userId:sessionTag">.
// De extensie leest dit en weigert opdrachten op een tabblad waar een ander account is aangemeld dan het gekoppelde
// (badge geel). Zonder aanmelding verdwijnt de tag. Geen geheim: alleen de interne gebruikers-id en een korte sessietag.
const NAME = 'mjn-account';
const ID_RE = /^[A-Za-z0-9_.@-]{1,200}$/;

export function sessionTagOf(startedAt: number | null | undefined): string {
  const n = Number(startedAt || 0);
  return n > 0 ? Math.floor(n).toString(36).slice(-12) : '';
}

export function setAccountClaim(userId: string | null | undefined, startedAt?: number | null): void {
  if (typeof document === 'undefined') return;
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${NAME}"]`);
  if (!userId || !ID_RE.test(userId)) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement('meta'); tag.name = NAME; document.head.appendChild(tag); }
  const content = `${userId}:${sessionTagOf(startedAt)}`;
  if (tag.content !== content) tag.content = content;
}
