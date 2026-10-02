import { normalizeAvatarUrl } from './shared-preferences';

export type AccountPresenceStatus = 'active' | 'signed_in' | 'reauth' | 'registration';

export type AccountMenuUser = {
  id?: string;
  accountId?: string;
  name: string;
  email: string;
  picture?: string;
  providerPicture?: string;
  customPhoto?: string;
  customPicture?: boolean | string;
  status?: string;
};

export type RememberedAccount = {
  grantId: string;
  user: AccountMenuUser;
  lastUsedAt: number;
  expiresAt: number;
  current?: boolean;
  silentAllowed?: boolean;
  hintOnly?: boolean;
  status?: AccountPresenceStatus;
  menuHidden?: boolean;
};

export type ExternalConnectableCandidate = {
  candidateId: string;
  provider: string;
  source: 'provider' | 'browser';
  user: AccountMenuUser;
  lastUsedAt: number;
};

export type AccountMenuSnapshot = {
  accounts: RememberedAccount[];
  /** Legacy backend projection of browser grants. It is deliberately not a provider-candidate source. */
  previews: RememberedAccount[];
  externalCandidates: ExternalConnectableCandidate[];
};

export type AccountMruHint = {
  name: string;
  email: string;
  picture?: string;
  lastUsedAt: number;
};

export type ResolvedAccountPhoto =
  | { kind: 'image'; source: 'custom' | 'provider'; src: string; initials: string }
  | { kind: 'initials'; source: 'initials'; src: ''; initials: string };

export type CanonicalAccountMenuModel = {
  currentAccount: RememberedAccount | null;
  knownAccounts: RememberedAccount[];
  otherKnownAccounts: RememberedAccount[];
  signedInAccounts: RememberedAccount[];
  otherSignedInAccounts: RememberedAccount[];
  reauthAccounts: RememberedAccount[];
  visibleExpandedAccounts: RememberedAccount[];
  externalConnectableCandidates: ExternalConnectableCandidate[];
  collapsedSwitchPreviewAccounts: RememberedAccount[];
  expandedAddPreviewAccounts: ExternalConnectableCandidate[];
  shouldShowOtherAccountsToggle: boolean;
  shouldShowLogoutAll: boolean;
  isFirstLogin: boolean;
};

export const MAX_PREVIEW_ACCOUNTS = 3;

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeId = (user: AccountMenuUser | null | undefined) => String(user?.id || user?.accountId || '').trim();

export const accountIdentityKey = (user: AccountMenuUser | null | undefined) => {
  const id = normalizeId(user);
  if (id) return `id:${id}`;
  const email = normalizeEmail(user?.email);
  return email ? `email:${email}` : '';
};

export const isSameAccount = (
  left: AccountMenuUser | null | undefined,
  right: AccountMenuUser | null | undefined,
) => {
  if (!left || !right) return false;
  const leftId = normalizeId(left);
  const rightId = normalizeId(right);
  if (leftId && rightId) return leftId === rightId;
  const leftEmail = normalizeEmail(left.email);
  const rightEmail = normalizeEmail(right.email);
  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail);
};

export const rememberedAccountStatus = (item: RememberedAccount): AccountPresenceStatus =>
  item.status || (item.current ? 'active' : item.silentAllowed ? 'signed_in' : item.user.status === 'new' ? 'registration' : 'reauth');

const initialsFor = (user: AccountMenuUser) => {
  const name = String(user.name || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join('');
  if (initials) return initials.toLocaleUpperCase();
  const emailPrefix = normalizeEmail(user.email).split('@')[0] || '';
  return (emailPrefix.slice(0, 2) || '?').toLocaleUpperCase();
};

export const resolveAccountPhoto = (user: AccountMenuUser): ResolvedAccountPhoto => {
  const explicitCustom = normalizeAvatarUrl(user.customPhoto);
  const customPictureValue = typeof user.customPicture === 'string' ? normalizeAvatarUrl(user.customPicture) : '';
  const customFlagPicture = user.customPicture === true ? normalizeAvatarUrl(user.picture) : '';
  const custom = explicitCustom || customPictureValue || customFlagPicture;
  const initials = initialsFor(user);
  if (custom) return { kind: 'image', source: 'custom', src: custom, initials };

  const provider = normalizeAvatarUrl(user.providerPicture) || (user.customPicture === true ? '' : normalizeAvatarUrl(user.picture));
  if (provider) return { kind: 'image', source: 'provider', src: provider, initials };
  return { kind: 'initials', source: 'initials', src: '', initials };
};

export const normalizeAccountMenuSnapshot = (
  value: AccountMenuSnapshot | RememberedAccount[] | undefined,
): AccountMenuSnapshot => {
  if (Array.isArray(value)) return { accounts: value, previews: [], externalCandidates: [] };
  return {
    accounts: Array.isArray(value?.accounts) ? value.accounts : [],
    previews: Array.isArray(value?.previews) ? value.previews : [],
    externalCandidates: Array.isArray(value?.externalCandidates) ? value.externalCandidates : [],
  };
};

const mruHintFor = (user: AccountMenuUser, history: AccountMruHint[]) =>
  history.reduce((latest, hint) => (isSameAccount(user, hint) ? Math.max(latest, Number(hint.lastUsedAt || 0)) : latest), 0);

export const sortAccountsByMru = <T extends { user: AccountMenuUser; lastUsedAt: number }>(
  items: T[],
  history: AccountMruHint[] = [],
) => [...items].sort((left, right) => {
  const rightMru = Math.max(Number(right.lastUsedAt || 0), mruHintFor(right.user, history));
  const leftMru = Math.max(Number(left.lastUsedAt || 0), mruHintFor(left.user, history));
  return rightMru - leftMru || accountIdentityKey(left.user).localeCompare(accountIdentityKey(right.user));
});

const mergeKnownAccount = (older: RememberedAccount, newer: RememberedAccount): RememberedAccount => {
  const newest = Number(newer.lastUsedAt || 0) >= Number(older.lastUsedAt || 0) ? newer : older;
  const other = newest === newer ? older : newer;
  return {
    ...other,
    ...newest,
    user: { ...other.user, ...newest.user },
    grantId: newest.grantId || other.grantId,
    lastUsedAt: Math.max(Number(older.lastUsedAt || 0), Number(newer.lastUsedAt || 0)),
    current: Boolean(older.current || newer.current),
    silentAllowed: newer.silentAllowed ?? older.silentAllowed,
    status: newer.status || older.status,
  };
};

const dedupeKnownAccounts = (items: RememberedAccount[]) => {
  const result: RememberedAccount[] = [];
  for (const item of items) {
    if (!accountIdentityKey(item.user)) continue;
    const index = result.findIndex((known) => isSameAccount(known.user, item.user));
    if (index < 0) result.push(item);
    else result[index] = mergeKnownAccount(result[index], item);
  }
  return result;
};

const dedupeExternalCandidates = (items: ExternalConnectableCandidate[]) => {
  const result: ExternalConnectableCandidate[] = [];
  for (const item of items) {
    if (!item.candidateId || !item.provider || !['provider', 'browser'].includes(item.source) || !accountIdentityKey(item.user)) continue;
    const index = result.findIndex((candidate) => isSameAccount(candidate.user, item.user));
    if (index < 0) result.push(item);
    else if (Number(item.lastUsedAt || 0) > Number(result[index].lastUsedAt || 0)) result[index] = item;
  }
  return result;
};

export const buildCanonicalAccountMenuModel = ({
  currentUser,
  snapshot,
  history = [],
}: {
  currentUser: AccountMenuUser | null;
  snapshot: AccountMenuSnapshot;
  history?: AccountMruHint[];
}): CanonicalAccountMenuModel => {
  // snapshot.previews is intentionally not used: backend previews are another projection of known browser grants.
  const authoritativeKnown = dedupeKnownAccounts(snapshot.accounts);
  let currentAccount: RememberedAccount | null = null;

  if (currentUser) {
    const match = authoritativeKnown.find((item) => isSameAccount(item.user, currentUser));
    currentAccount = match
      ? { ...match, user: { ...match.user, ...currentUser }, current: true, status: 'active', silentAllowed: true }
      : {
          grantId: '',
          user: currentUser,
          lastUsedAt: mruHintFor(currentUser, history),
          expiresAt: 0,
          current: true,
          silentAllowed: true,
          status: 'active',
        };
  }

  const knownAccounts = sortAccountsByMru(
    dedupeKnownAccounts(currentAccount ? [currentAccount, ...authoritativeKnown] : authoritativeKnown),
    history,
  );
  const otherKnownAccounts = currentAccount
    ? knownAccounts.filter((item) => !isSameAccount(item.user, currentAccount?.user))
    : knownAccounts;
  const signedInAccounts = knownAccounts.filter((item) => {
    const status = rememberedAccountStatus(item);
    return status === 'active' || status === 'signed_in';
  });
  const otherSignedInAccounts = currentAccount
    ? signedInAccounts.filter((item) => !isSameAccount(item.user, currentAccount?.user))
    : signedInAccounts;
  const reauthAccounts = knownAccounts.filter((item) => {
    const status = rememberedAccountStatus(item);
    return status === 'reauth' || status === 'registration';
  });
  const externalConnectableCandidates = sortAccountsByMru(
    dedupeExternalCandidates(snapshot.externalCandidates).filter(
      (candidate) => !knownAccounts.some((known) => isSameAccount(known.user, candidate.user)),
    ),
    history,
  );
  const visibleExpandedAccounts = otherKnownAccounts;
  const collapsedSwitchPreviewAccounts = otherSignedInAccounts.slice(0, MAX_PREVIEW_ACCOUNTS);
  const expandedAddPreviewAccounts = externalConnectableCandidates.slice(0, MAX_PREVIEW_ACCOUNTS);

  return {
    currentAccount,
    knownAccounts,
    otherKnownAccounts,
    signedInAccounts,
    otherSignedInAccounts,
    reauthAccounts,
    visibleExpandedAccounts,
    externalConnectableCandidates,
    collapsedSwitchPreviewAccounts,
    expandedAddPreviewAccounts,
    shouldShowOtherAccountsToggle: currentAccount !== null && otherKnownAccounts.length >= 1,
    shouldShowLogoutAll: signedInAccounts.length >= 2,
    isFirstLogin: currentAccount === null && knownAccounts.length === 0,
  };
};
