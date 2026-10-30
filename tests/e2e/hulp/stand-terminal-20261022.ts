// Стенд (22.10.2026, зона G) — «Термінал» технічного профілю. Кроки «terminal-*» (fase tech, hub.*/overzicht → смуга ⋯ → Термінал):
//   terminal-zonder-apparaat — жодного пристрою: майстер «Підключити сервер як пристрій» з командою й кнопкою «Перевірити стан».
//   terminal-server          — сервер-пристрій (технічний простір, агент 0.8.0 за справжнім обробником term.exec у цьому ж процесі,
//                              з’єднаний через справжній gateway): вікно відкрито ОДРАЗУ, рядок стану «підключено як beheer@vm», `ls`
//                              виконано (вивід, «ok», кнопка копіювання).
//   terminal-server-bevestig — `node meta.js x` (змінює) → діалог підтвердження у вікні.
//   terminal-powershell      — другий пристрій «PC» (PowerShell): вибір у списку, статус «PowerShell на pavlo@PC», команда → діалог
//                              «PowerShell: команда виконається на «PC»».
// Усе в процесі стенду; нічого з реального сервера не торкається.
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

type Page = import('playwright-core').Page;
type Stap = { naam: string; url: string; voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; fase?: 'prive' | 'tech' };
export type TerminalCtx = { hubUrl: string; uid: () => string; zeg: (s: string) => void };

class NepWs extends EventEmitter { sent: any[] = []; readyState = 1; send(t: string) { this.sent.push(JSON.parse(t)); } close() { this.emit('close'); } terminate() { this.emit('close'); } }
let apparaten: { server: string; pc: string } | null = null;

/** Eenmalig: twee apparaten van de eigenaar (server + pc) en hun nagebootste verbindingen met de ECHTE agent-handler erachter. */
async function apparatenMaken(uid: string, zeg: (s: string) => void) {
  if (apparaten) return apparaten;
  const store = await import('../../../backend/connectors-opslag');
  const gw = await import('../../../backend/connectors-gateway');
  await import('../../../backend/terminal');
  const { sha256 } = await import('../../../backend/connectors-crypto');
  const agent: any = await import(resolve('deploy/agent/agent.mjs'));
  const werk = mkdtempSync(join(tmpdir(), 'stand-term-'));
  const thuis = join(werk, 'home', 'beheer'), srv = join(werk, 'srv', 'mijn-ruimte');
  mkdirSync(join(thuis, 'projecten'), { recursive: true }); mkdirSync(join(srv, 'current'), { recursive: true });
  writeFileSync(join(thuis, 'meta.js'), 'console.log("hallo", process.argv.slice(2).join(" "))');
  writeFileSync(join(thuis, 'notities.txt'), 'stand');
  writeFileSync(join(srv, 'current', 'UITROL-VERSIE'), '20261022-121416\n');
  const bin = join(werk, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'pwsh'), '#!/bin/sh\nfor a in "$@"; do printf "%s\\n" "$a"; done\n');
  const { chmodSync } = await import('node:fs'); chmodSync(join(bin, 'pwsh'), 0o755);
  process.env.PATH = `${bin}:${process.env.PATH}`;
  const legacy = process.env.AGENT_WS_TOKEN_AUTH_LEGACY; delete process.env.AGENT_WS_TOKEN_AUTH_LEGACY;
  const maak = async (naam: string, platform: string, caps: any, cfg: any) => {
    const token = randomBytes(24).toString('base64url');
    const row = await store.createAgent(uid, naam, platform, sha256(token), caps, undefined, { ruimte: 'technisch', version: '0.8.0' });
    const ws = new NepWs();
    gw.onConnection(ws as any);
    const orig = ws.send.bind(ws);
    ws.send = (t: string) => { orig(t); const m = JSON.parse(t); if (m.t === 'cmd') void Promise.resolve().then(() => agent.handlers[m.type](cfg, m.params ?? {})).then((data: unknown) => ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: m.id, ok: true, data }))), (e: Error) => ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: m.id, ok: false, error: e.message })))); };
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'auth', token, version: '0.8.0', capabilities: caps })));
    for (let i = 0; i < 100 && !ws.sent.some((m) => m.t === 'ready'); i++) await new Promise((r) => setTimeout(r, 25));
    return row.id;
  };
  const allow = ['ls', 'cat', 'node', 'git', 'systemctl', 'journalctl', 'df', 'free', 'uptime'];
  const server = await maak('vm · сервер (beheer)', 'linux-x64', { version: '0.8.0', roots: [thuis, srv], readonlyRoots: [srv], allowCommands: allow, gebruiker: 'beheer', host: 'vm', terminal: { enabled: true, container: false, opdrachten: true, powershell: false, maxMinuten: 60, test: false } },
    { roots: [thuis, srv], readonlyRoots: [srv], allow, terminal: { enabled: true, container: false, opdrachten: true } });
  const pc = await maak('PC', 'win32-x64', { version: '0.8.0', roots: [thuis], readonlyRoots: [], allowCommands: [], gebruiker: 'pavlo', host: 'PC', terminal: { enabled: true, container: false, opdrachten: false, powershell: true, maxMinuten: 60, test: false } },
    { roots: [thuis], allow: [], terminal: { enabled: true, container: false, powershell: true } });
  if (legacy !== undefined) process.env.AGENT_WS_TOKEN_AUTH_LEGACY = legacy;
  apparaten = { server, pc };
  zeg(`   terminal-stand: apparaten ${server} (server) en ${pc} (pc) verbonden; map ${werk}`);
  return apparaten;
}

async function terminalOpenen(p: Page) {
  const band = p.locator('[data-tech-band]').first();
  await band.waitFor({ timeout: 15000 });
  const knop = p.locator('[data-tech-band] [data-tech-knop="terminal"]').first();
  if (!(await knop.isVisible().catch(() => false))) { await p.locator('[data-tech-band] [data-tech-knop="meer"]').first().click({ timeout: 8000 }); await p.waitForTimeout(300); }
  await knop.click({ timeout: 8000 });
  await p.locator('[data-term-wizard], [data-term-sessie="opdracht"], [data-term-venster="openen"]').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(500);
}
async function typ(p: Page, regel: string) {
  const veld = p.locator('[data-term-invoer]').first();
  await veld.waitFor({ timeout: 10000 });
  await veld.fill(regel);
  await veld.press('Enter');
}

export function terminalStappen(o: TerminalCtx): Stap[] {
  const url = `${o.hubUrl}/overzicht`;
  return [
    { naam: 'terminal-zonder-apparaat', url, fase: 'tech', na: async (p) => { await terminalOpenen(p); o.zeg(`   wizard: ${await p.locator('[data-term-wizard]').count()} · opdracht-tekst: ${await p.locator('[data-term-opdracht-inrichten]').first().textContent().catch(() => '?')}`); } },
    { naam: 'terminal-server', url, fase: 'tech', voor: async () => { await apparatenMaken(o.uid(), o.zeg); }, na: async (p) => {
      await terminalOpenen(p);
      await typ(p, 'ls');
      await p.locator('[data-term-regel="klaar"]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      await p.waitForTimeout(400);
      o.zeg(`   status: ${await p.locator('[data-term-wie]').first().textContent().catch(() => '?')} · regels: ${await p.locator('[data-term-regel]').count()} · staat: ${await p.locator('[data-term-regel]').first().getAttribute('data-term-regel').catch(() => '?')}`);
    } },
    { naam: 'terminal-server-bevestig', url, fase: 'tech', voor: async () => { await apparatenMaken(o.uid(), o.zeg); }, na: async (p) => {
      await terminalOpenen(p);
      await typ(p, 'node meta.js x');
      await p.locator('[data-term-bevestig]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(300);
      o.zeg(`   bevestigdialoog: ${await p.locator('[data-term-bevestig]').count()}`);
    } },
    { naam: 'terminal-powershell', url, fase: 'tech', voor: async () => { await apparatenMaken(o.uid(), o.zeg); }, na: async (p) => {
      await terminalOpenen(p);
      const keuze = p.locator('[data-term-apparaat]').first();
      const pcId = apparaten?.pc ?? '';
      await keuze.selectOption(pcId).catch(async () => { await keuze.selectOption({ index: 1 }).catch(() => undefined); });
      await p.waitForTimeout(400);
      await typ(p, 'Get-Service wuauserv | Select Status');
      await p.locator('[data-term-bevestig]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
      await p.waitForTimeout(300);
      o.zeg(`   modus: ${await p.locator('[data-term-sessie="opdracht"]').first().getAttribute('data-term-modus').catch(() => '?')} · status: ${await p.locator('[data-term-wie]').first().textContent().catch(() => '?')} · dialoog: ${await p.locator('[data-term-bevestig]').count()}`);
      // Meting: hoogte van invoerveld en knop (tik ≥ 44 px op de telefoon) en hoeveel terminalvensters er zijn.
      o.zeg(`   bevestiging: ${await p.evaluate(() => { const k = document.querySelector('[data-term-knop="bevestig"]') as HTMLElement | null; const opt = (document.querySelector('[data-term-apparaat]') as HTMLSelectElement | null)?.selectedOptions[0]?.textContent ?? ''; return JSON.stringify({ knop: k ? Math.round(k.getBoundingClientRect().height) : null, focus: document.activeElement === k, invoerVerborgen: !document.querySelector('#term-invoer-veld'), keuze: opt, w: innerWidth }); }).catch((e) => String(e))}`);
    } },
  ];
}
