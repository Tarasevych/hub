/**
 * Модель політики доступу: що дозволено кожному ШІ і як це перевіряється.
 * Чистий модуль (без Node-залежностей): однаково працює на сервері й у браузері,
 * тому інтерфейс показує власнику рівно те саме, що рахує сервер.
 *
 * Сервер перевіряє КОЖЕН виклик інструмента через `evaluate()`. Строк дії
 * обчислюється з абсолютних позначок за годинником сервера, тож доступ реально
 * зникає в момент закінчення — навіть якщо жодна вкладка не відкрита.
 */

import {
  type Mode, type GrantSpec, type After,
  resolveGrant, describeMode, countdown, effectiveMode, DEFAULT_TZ,
} from './time';
import {
  capabilityForTool, capabilityInfo, isKnownCapability, isOwnerOnly,
  expandCapabilities, stripToolPrefix,
} from './catalog';

export const POLICY_VERSION = 1;

export type KeyType = 'webauthn' | 'ed25519';

export interface OwnerKey {
  id: string;
  type: KeyType;
  /** SPKI DER у base64url. Для passkey це `response.getPublicKey()` при реєстрації. */
  publicKey: string;
  /** Лише для passkey: ідентифікатор облікових даних (rawId, base64url) — потрібен браузеру, щоб запропонувати саме цей ключ. */
  credentialId?: string;
  label: string;
  addedAt: number;
}

export interface AgentPolicy {
  name: string;
  /** Вимкнений агент не може нічого, незалежно від режимів. */
  enabled: boolean;
  /** Режим для можливостей, яких немає у `capabilities`. */
  defaultMode: Mode;
  capabilities: Record<string, Mode>;
}

/** Які погодження («питати щоразу») власник підтверджує апаратним підписом, а не лише кліком. */
export type ApprovalSignature = 'never' | 'risky' | 'all';

export interface Policy {
  v: typeof POLICY_VERSION;
  seq: number;
  prevHash: string | null;
  issuedAt: number;
  ownerKeys: OwnerKey[];
  approvalSignature: ApprovalSignature;
  agents: Record<string, AgentPolicy>;
}

export class PolicyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PolicyError';
    this.code = code;
  }
}

// ───────────────────────── перевірка структури ─────────────────────────

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function assertMode(m: unknown, where: string): asserts m is Mode {
  if (!m || typeof m !== 'object') throw new PolicyError('bad_mode', `${where}: режим відсутній.`);
  const mode = m as Record<string, unknown>;
  switch (mode.kind) {
    case 'off': case 'ask': case 'always': return;
    case 'timed': {
      const { startedAt, expiresAt, after, label } = mode as Record<string, unknown>;
      if (typeof startedAt !== 'number' || typeof expiresAt !== 'number' || !Number.isFinite(startedAt) || !Number.isFinite(expiresAt)) {
        throw new PolicyError('bad_mode', `${where}: некоректні межі часу.`);
      }
      if (expiresAt <= startedAt) throw new PolicyError('bad_mode', `${where}: строк закінчується раніше, ніж починається.`);
      if (after !== 'off' && after !== 'ask') throw new PolicyError('bad_mode', `${where}: після строку може бути лише «вимкнено» або «питати».`);
      if (typeof label !== 'string' || label.length > 80) throw new PolicyError('bad_mode', `${where}: некоректний підпис строку.`);
      return;
    }
    default:
      throw new PolicyError('bad_mode', `${where}: невідомий режим «${String(mode.kind)}».`);
  }
}

/** Структурна перевірка. Криптографію (підписи) перевіряє `crypto.ts`. */
export function assertPolicy(p: unknown): asserts p is Policy {
  if (!p || typeof p !== 'object') throw new PolicyError('bad_policy', 'Політика порожня.');
  const pol = p as Record<string, unknown>;
  if (pol.v !== POLICY_VERSION) throw new PolicyError('bad_version', 'Непідтримувана версія політики.');
  if (!Number.isInteger(pol.seq) || (pol.seq as number) < 0) throw new PolicyError('bad_seq', 'Некоректний номер версії.');
  if (pol.prevHash !== null && !(typeof pol.prevHash === 'string' && /^[0-9a-f]{64}$/.test(pol.prevHash))) {
    throw new PolicyError('bad_prev', 'Некоректний хеш попередньої версії.');
  }
  if ((pol.seq === 0) !== (pol.prevHash === null)) throw new PolicyError('bad_prev', 'Лише перша версія може не мати попередньої.');
  if (typeof pol.issuedAt !== 'number' || !Number.isFinite(pol.issuedAt)) throw new PolicyError('bad_time', 'Некоректний час випуску.');
  if (pol.approvalSignature !== 'never' && pol.approvalSignature !== 'risky' && pol.approvalSignature !== 'all') {
    throw new PolicyError('bad_approval', 'Некоректне правило підпису погоджень.');
  }

  if (!Array.isArray(pol.ownerKeys) || pol.ownerKeys.length < 1 || pol.ownerKeys.length > 16) {
    throw new PolicyError('bad_keys', 'Має бути від 1 до 16 ключів власника.');
  }
  const seen = new Set<string>();
  for (const k of pol.ownerKeys as unknown[]) {
    const key = k as Record<string, unknown>;
    if (!key || typeof key.id !== 'string' || !ID_RE.test(key.id)) throw new PolicyError('bad_keys', 'Некоректний ідентифікатор ключа.');
    if (seen.has(key.id)) throw new PolicyError('bad_keys', `Ключ «${key.id}» повторюється.`);
    seen.add(key.id);
    if (key.type !== 'webauthn' && key.type !== 'ed25519') throw new PolicyError('bad_keys', `Ключ «${key.id}»: невідомий тип.`);
    if (typeof key.publicKey !== 'string' || key.publicKey.length < 20 || key.publicKey.length > 2048) {
      throw new PolicyError('bad_keys', `Ключ «${key.id}»: некоректний відкритий ключ.`);
    }
    if (key.type === 'webauthn' && !(typeof key.credentialId === 'string' && /^[A-Za-z0-9_-]{8,1400}$/.test(key.credentialId))) {
      throw new PolicyError('bad_keys', `Ключ «${key.id}»: для passkey потрібен credentialId.`);
    }
    if (key.type === 'ed25519' && key.credentialId !== undefined) throw new PolicyError('bad_keys', `Ключ «${key.id}»: credentialId лише для passkey.`);
    if (typeof key.label !== 'string' || key.label.length > 80) throw new PolicyError('bad_keys', `Ключ «${key.id}»: некоректна назва.`);
    if (typeof key.addedAt !== 'number') throw new PolicyError('bad_keys', `Ключ «${key.id}»: немає часу додавання.`);
  }

  if (!pol.agents || typeof pol.agents !== 'object' || Array.isArray(pol.agents)) throw new PolicyError('bad_agents', 'Немає списку агентів.');
  const agents = pol.agents as Record<string, unknown>;
  if (Object.keys(agents).length > 64) throw new PolicyError('bad_agents', 'Забагато агентів.');
  for (const [id, a] of Object.entries(agents)) {
    if (!ID_RE.test(id)) throw new PolicyError('bad_agents', `Некоректний ідентифікатор агента «${id}».`);
    const ag = a as Record<string, unknown>;
    if (!ag || typeof ag.name !== 'string' || ag.name.length === 0 || ag.name.length > 80) throw new PolicyError('bad_agents', `Агент «${id}»: некоректна назва.`);
    if (typeof ag.enabled !== 'boolean') throw new PolicyError('bad_agents', `Агент «${id}»: не вказано, увімкнений він чи ні.`);
    assertMode(ag.defaultMode, `Агент «${id}» (за замовчуванням)`);
    if (!ag.capabilities || typeof ag.capabilities !== 'object' || Array.isArray(ag.capabilities)) {
      throw new PolicyError('bad_agents', `Агент «${id}»: немає списку можливостей.`);
    }
    for (const [cap, mode] of Object.entries(ag.capabilities as Record<string, unknown>)) {
      if (!isKnownCapability(cap)) throw new PolicyError('bad_capability', `Агент «${id}»: невідома можливість «${cap}».`);
      if (isOwnerOnly(cap)) throw new PolicyError('owner_only', `Можливість «${cap}» не можна видати агентові.`);
      assertMode(mode, `Агент «${id}», ${cap}`);
    }
  }
}

// ───────────────────────── перевірка виклику ─────────────────────────

export type Effect = 'allow' | 'ask' | 'deny';

export type DecisionCode =
  | 'policy_missing' | 'frozen' | 'agent_unknown' | 'agent_disabled' | 'owner_only'
  | 'unmapped_tool'
  | 'always' | 'timed' | 'ask' | 'off'
  | 'expired_off' | 'expired_ask';

export interface Decision {
  effect: Effect;
  code: DecisionCode;
  /** Пояснення українською — його бачить і агент, і власник. */
  reason: string;
  capability?: string;
  /** Скільки ще діє дозвіл, мс (лише для `timed`). */
  remainingMs?: number;
  /** Коли строк закінчився/закінчиться. */
  expiresAt?: number;
  policySeq?: number;
}

export interface EvaluateOptions {
  /** Аварійна «заморозка» всього, увімкнена власником зі свого сеансу. */
  frozen?: boolean;
}

/**
 * Рішення для виклику. Принципи:
 *  • немає політики або вона зіпсована → відмова (fail closed), а не «усе дозволено»;
 *  • `policy.change` не отримує жоден агент;
 *  • інструмент поза каталогом → «питати власника», а не мовчазний дозвіл чи мовчазна заборона;
 *  • строк закінчується в момент `expiresAt` за годинником сервера.
 */
export function evaluate(
  policy: Policy | null,
  agentId: string,
  toolOrCapability: string,
  now: number,
  opts: EvaluateOptions = {},
): Decision {
  if (!policy) {
    return { effect: 'deny', code: 'policy_missing', reason: 'Політика доступу недоступна або не пройшла перевірку підпису. Усе зупинено до відновлення власником.' };
  }
  const policySeq = policy.seq;
  if (opts.frozen) {
    return { effect: 'deny', code: 'frozen', reason: 'Власник тимчасово заморозив доступ усіх агентів.', policySeq };
  }

  const stripped = stripToolPrefix(toolOrCapability);
  const capability = isKnownCapability(toolOrCapability) ? toolOrCapability : capabilityForTool(stripped);
  if (!capability) {
    return {
      effect: 'ask', code: 'unmapped_tool', policySeq,
      reason: `Інструмент «${stripped}» ще не внесений до каталогу дозволів, тому потрібне рішення власника.`,
    };
  }
  if (isOwnerOnly(capability)) {
    return { effect: 'deny', code: 'owner_only', capability, policySeq, reason: 'Змінювати дозволи може лише власник зі своїм цифровим підписом.' };
  }

  const agent = policy.agents[agentId];
  if (!agent) {
    return { effect: 'deny', code: 'agent_unknown', capability, policySeq, reason: 'Цього агента немає в списку власника. Власник має спершу додати його.' };
  }
  if (!agent.enabled) {
    return { effect: 'deny', code: 'agent_disabled', capability, policySeq, reason: `Агента «${agent.name}» вимкнено власником.` };
  }

  const label = capabilityInfo(capability)?.label ?? capability;
  const mode = Object.hasOwn(agent.capabilities, capability) ? agent.capabilities[capability]! : agent.defaultMode;

  switch (mode.kind) {
    case 'always':
      return { effect: 'allow', code: 'always', capability, policySeq, reason: `«${label}»: дозволено завжди.` };
    case 'off':
      return { effect: 'deny', code: 'off', capability, policySeq, reason: `«${label}»: вимкнено власником.` };
    case 'ask':
      return { effect: 'ask', code: 'ask', capability, policySeq, reason: `«${label}»: власник вирішує щоразу.` };
    case 'timed': {
      if (now < mode.expiresAt) {
        return {
          effect: 'allow', code: 'timed', capability, policySeq,
          remainingMs: mode.expiresAt - now, expiresAt: mode.expiresAt,
          reason: `«${label}»: дозволено ${mode.label}.`,
        };
      }
      const after = effectiveMode(mode, now);
      if (after.kind === 'ask') {
        return { effect: 'ask', code: 'expired_ask', capability, policySeq, expiresAt: mode.expiresAt, reason: `«${label}»: строк дозволу вичерпано, тепер власник вирішує щоразу.` };
      }
      return { effect: 'deny', code: 'expired_off', capability, policySeq, expiresAt: mode.expiresAt, reason: `«${label}»: строк дозволу вичерпано, доступ вимкнено.` };
    }
  }
}

// ───────────────────────── операції власника → нова версія ─────────────────────────

export type Op =
  | { op: 'grant'; agent: string; capabilities: readonly string[] | '*'; spec: GrantSpec }
  | { op: 'default'; agent: string; spec: GrantSpec }
  | { op: 'agent_add'; agent: string; name: string; spec?: GrantSpec }
  | { op: 'agent_enable'; agent: string; enabled: boolean }
  | { op: 'agent_remove'; agent: string }
  | { op: 'key_add'; key: OwnerKey }
  | { op: 'key_remove'; keyId: string }
  | { op: 'approval_signature'; mode: ApprovalSignature };

function clonePolicy(p: Policy): Policy {
  return JSON.parse(JSON.stringify(p)) as Policy;
}

/** Скільки агентів зачепить операція `*`. */
function targetAgents(policy: Policy, agent: string): string[] {
  if (agent === '*') return Object.keys(policy.agents);
  if (!policy.agents[agent]) throw new PolicyError('agent_unknown', `Агента «${agent}» немає у списку.`);
  return [agent];
}

/**
 * Будує ЧЕРНЕТКУ наступної версії. Нічого не зберігає й нічого не підписує:
 * чернетку власник бачить на екрані, підписує своїм ключем, і лише тоді вона діє.
 */
export function buildDraft(prev: Policy, prevHash: string, ops: readonly Op[], now: number, tz: string = DEFAULT_TZ): Policy {
  if (ops.length === 0) throw new PolicyError('no_ops', 'Немає жодної зміни.');
  const next = clonePolicy(prev);
  next.seq = prev.seq + 1;
  next.prevHash = prevHash;
  next.issuedAt = Math.max(now, prev.issuedAt);

  for (const op of ops) {
    switch (op.op) {
      case 'grant': {
        const caps = expandCapabilities(op.capabilities);
        if (caps.length === 0) throw new PolicyError('no_caps', 'Не вибрано жодної можливості.');
        for (const id of targetAgents(next, op.agent)) {
          const mode = resolveGrant(op.spec, now, tz);
          for (const cap of caps) next.agents[id]!.capabilities[cap] = structuredClone(mode);
        }
        break;
      }
      case 'default': {
        for (const id of targetAgents(next, op.agent)) next.agents[id]!.defaultMode = resolveGrant(op.spec, now, tz);
        break;
      }
      case 'agent_add': {
        if (next.agents[op.agent]) throw new PolicyError('agent_exists', `Агент «${op.agent}» уже є.`);
        next.agents[op.agent] = {
          name: op.name, enabled: true, capabilities: {},
          defaultMode: resolveGrant(op.spec ?? { type: 'ask' }, now, tz),
        };
        break;
      }
      case 'agent_enable': {
        for (const id of targetAgents(next, op.agent)) next.agents[id]!.enabled = op.enabled;
        break;
      }
      case 'agent_remove': {
        if (!next.agents[op.agent]) throw new PolicyError('agent_unknown', `Агента «${op.agent}» немає у списку.`);
        delete next.agents[op.agent];
        break;
      }
      case 'key_add': {
        if (next.ownerKeys.some((k) => k.id === op.key.id)) throw new PolicyError('key_exists', `Ключ «${op.key.id}» уже є.`);
        next.ownerKeys.push(op.key);
        break;
      }
      case 'key_remove': {
        const left = next.ownerKeys.filter((k) => k.id !== op.keyId);
        if (left.length === next.ownerKeys.length) throw new PolicyError('key_unknown', `Ключа «${op.keyId}» немає.`);
        if (left.length === 0) throw new PolicyError('last_key', 'Не можна видалити останній ключ власника.');
        next.ownerKeys = left;
        break;
      }
      case 'approval_signature': {
        next.approvalSignature = op.mode;
        break;
      }
    }
  }
  assertPolicy(next);
  return next;
}

// ───────────────────────── перегляд для інтерфейсу ─────────────────────────

export interface GrantRow {
  agentId: string;
  agentName: string;
  enabled: boolean;
  capability: string;
  group: string;
  label: string;
  /** true — це значення «за замовчуванням» агента, а не окремий запис. */
  inherited: boolean;
  mode: Mode;
  /** Що діє ЗАРАЗ (з урахуванням строку). */
  effect: Effect;
  description: string;
  /** Для таймера на екрані. */
  timer: { total: number; elapsed: number; remaining: number; fraction: number; expired: boolean; startedAt: number; expiresAt: number } | null;
}

/** Таблиця «агент × можливість» з готовими даними для таймера. */
export function listGrants(policy: Policy, now: number, tz: string = DEFAULT_TZ): GrantRow[] {
  const rows: GrantRow[] = [];
  for (const [agentId, agent] of Object.entries(policy.agents)) {
    for (const cap of expandCapabilities('*')) {
      const info = capabilityInfo(cap)!;
      const own = Object.hasOwn(agent.capabilities, cap);
      const mode = own ? agent.capabilities[cap]! : agent.defaultMode;
      const eff = effectiveMode(mode, now);
      const c = countdown(mode, now);
      const effect: Effect = !agent.enabled ? 'deny'
        : mode.kind === 'timed' && !c!.expired ? 'allow'
        : eff.kind === 'always' ? 'allow' : eff.kind === 'ask' ? 'ask' : 'deny';
      rows.push({
        agentId, agentName: agent.name, enabled: agent.enabled,
        capability: cap, group: info.group, label: info.label,
        inherited: !own, mode, effect,
        description: describeMode(mode, now, tz),
        timer: mode.kind === 'timed' && c
          ? { ...c, startedAt: mode.startedAt, expiresAt: mode.expiresAt }
          : null,
      });
    }
  }
  return rows;
}

export interface ExpiryItem { agentId: string; capability: string | null; expiresAt: number; after: After }

/** Усі строки, що ще не вичерпані, від найближчого: службі потрібно знати, коли прокинутись. */
export function upcomingExpiries(policy: Policy, now: number): ExpiryItem[] {
  const out: ExpiryItem[] = [];
  for (const [agentId, agent] of Object.entries(policy.agents)) {
    if (agent.defaultMode.kind === 'timed' && agent.defaultMode.expiresAt > now) {
      out.push({ agentId, capability: null, expiresAt: agent.defaultMode.expiresAt, after: agent.defaultMode.after });
    }
    for (const [capability, m] of Object.entries(agent.capabilities)) {
      if (m.kind === 'timed' && m.expiresAt > now) out.push({ agentId, capability, expiresAt: m.expiresAt, after: m.after });
    }
  }
  return out.sort((a, b) => a.expiresAt - b.expiresAt);
}

/** Строки, що вичерпались між `since` та `now`: для запису у журнал «доступ закінчився». */
export function justExpired(policy: Policy, since: number, now: number): ExpiryItem[] {
  const out: ExpiryItem[] = [];
  for (const [agentId, agent] of Object.entries(policy.agents)) {
    const consider = (capability: string | null, m: Mode) => {
      if (m.kind === 'timed' && m.expiresAt > since && m.expiresAt <= now) out.push({ agentId, capability, expiresAt: m.expiresAt, after: m.after });
    };
    consider(null, agent.defaultMode);
    for (const [capability, m] of Object.entries(agent.capabilities)) consider(capability, m);
  }
  return out.sort((a, b) => a.expiresAt - b.expiresAt);
}

// ───────────────────────── різниця між версіями ─────────────────────────

export interface DiffLine {
  kind: 'grant' | 'default' | 'agent' | 'key' | 'approval';
  agentId?: string;
  capability?: string | null;
  from: string;
  to: string;
  text: string;
}

function modeSame(a: Mode, b: Mode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Людська різниця «було → стане». Її власник бачить ПЕРЕД підписом;
 * інтерфейс рахує її сам із чернетки, а не бере готовий текст від сервера.
 */
export function diffPolicy(prev: Policy, next: Policy, now: number, tz: string = DEFAULT_TZ): DiffLine[] {
  const lines: DiffLine[] = [];
  const ids = new Set([...Object.keys(prev.agents), ...Object.keys(next.agents)]);
  for (const id of ids) {
    const a = prev.agents[id];
    const b = next.agents[id];
    if (!a && b) { lines.push({ kind: 'agent', agentId: id, from: '—', to: 'додано', text: `Додано агента «${b.name}»` }); continue; }
    if (a && !b) { lines.push({ kind: 'agent', agentId: id, from: 'був', to: 'видалено', text: `Видалено агента «${a.name}»` }); continue; }
    if (!a || !b) continue;
    if (a.enabled !== b.enabled) {
      lines.push({ kind: 'agent', agentId: id, from: a.enabled ? 'увімкнено' : 'вимкнено', to: b.enabled ? 'увімкнено' : 'вимкнено', text: `Агент «${b.name}»: ${b.enabled ? 'увімкнено' : 'вимкнено'}` });
    }
    if (!modeSame(a.defaultMode, b.defaultMode)) {
      lines.push({ kind: 'default', agentId: id, capability: null, from: describeMode(a.defaultMode, now, tz), to: describeMode(b.defaultMode, now, tz), text: `«${b.name}» · усе, що не налаштовано окремо` });
    }
    const caps = new Set([...Object.keys(a.capabilities), ...Object.keys(b.capabilities)]);
    for (const cap of caps) {
      const ma = a.capabilities[cap] ?? null;
      const mb = b.capabilities[cap] ?? null;
      if (ma && mb && modeSame(ma, mb)) continue;
      const label = capabilityInfo(cap)?.label ?? cap;
      const from = ma ? describeMode(ma, now, tz) : `як усе інше (${describeMode(a.defaultMode, now, tz)})`;
      const to = mb ? describeMode(mb, now, tz) : `як усе інше (${describeMode(b.defaultMode, now, tz)})`;
      lines.push({ kind: 'grant', agentId: id, capability: cap, from, to, text: `«${b.name}» · ${label}` });
    }
  }
  const prevKeys = new Map(prev.ownerKeys.map((k) => [k.id, k]));
  const nextKeys = new Map(next.ownerKeys.map((k) => [k.id, k]));
  for (const [id, k] of nextKeys) if (!prevKeys.has(id)) lines.push({ kind: 'key', from: '—', to: 'додано', text: `Додано ключ власника «${k.label}»` });
  for (const [id, k] of prevKeys) if (!nextKeys.has(id)) lines.push({ kind: 'key', from: 'був', to: 'видалено', text: `Видалено ключ власника «${k.label}»` });
  if (prev.approvalSignature !== next.approvalSignature) {
    const names: Record<ApprovalSignature, string> = { never: 'ніколи (лише клік)', risky: 'для небезпечних дій', all: 'для кожного погодження' };
    lines.push({ kind: 'approval', from: names[prev.approvalSignature], to: names[next.approvalSignature], text: `Підпис ключем при погодженні: ${names[next.approvalSignature]}` });
  }
  return lines;
}

/** Чи потребує погодження цього виклику апаратного підпису за правилом політики. */
export function approvalNeedsSignature(policy: Policy, capability: string): boolean {
  if (policy.approvalSignature === 'all') return true;
  if (policy.approvalSignature === 'never') return false;
  const risk = capabilityInfo(capability)?.risk;
  return risk === 'write' || risk === 'dangerous';
}
