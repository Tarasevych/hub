// Opdrachten voor het koppelen van een pc of VM, per shell correct gequoot (zuivere functies; getest in tests/eenheid/agent-opdrachten.test.ts).
export type Shell = 'powershell' | 'cmd' | 'bash';
export type Os = 'windows' | 'macos' | 'linux';

/** Argument voor Windows (PowerShell en cmd): tussen aanhalingstekens; een backslash vóór het sluitende teken wordt verdubbeld, anders eet `"T:\"` de aanhalingsteken op. */
export const winQuote = (value: string) => `"${value.replace(/"/g, '').replace(/(\\+)$/, '$1$1')}"`;
export const posixQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
/** Typische fout: in de uitleg stond "<TOEGESTANE_MAP>" en de gebruiker liet de punthaken staan (in PowerShell is "<" gereserveerd). */
export const looksLikePlaceholder = (value: string) => /[<>"|?*]/.test(value) || /ДОЗВОЛЕНА|TOEGESTANE|ТЕКА|FOLDER/i.test(value);

/** `readonlyRoots`: mappen die de agent alleen mag lezen en tonen (agent 0.3.1+, `--readonly-root`), bv. back-ups op R:\. */
export function buildAgentCommands(opts: { shell: Shell; server: string; code: string; name: string; roots: string[]; readonlyRoots?: string[]; allow: string[] }): string[] {
  const q = opts.shell === 'bash' ? posixQuote : winQuote;
  const roots = [...opts.roots.map((r) => `--root ${q(r)}`), ...(opts.readonlyRoots ?? []).map((r) => `--readonly-root ${q(r)}`)].join(' ');
  const allow = opts.allow.length ? ` --allow ${opts.allow.join(',')}` : '';
  return [`node agent.mjs pair --server ${opts.server} --code ${opts.code} --name ${q(opts.name)} ${roots}${allow}`, 'node agent.mjs run'];
}

/** Kant-en-klaar startbestand: gaat naar zijn eigen map (waar agent.mjs staat), voert beide opdrachten uit en blijft open staan. */
export function buildRunnerScript(os: Os, commands: string[]): { text: string; file: string } {
  if (os === 'windows') return { file: 'Mijn-Ruimte-agent.cmd', text: ['@echo off', 'chcp 65001 >nul', 'cd /d "%~dp0"', ...commands, 'pause', ''].join('\r\n') };
  return { file: 'mijn-ruimte-agent.sh', text: ['#!/bin/sh', 'cd "$(dirname "$0")" || exit 1', ...commands, ''].join('\n') };
}
