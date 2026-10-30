import{test}from'node:test';import assert from'node:assert/strict';import{spawnSync}from'node:child_process';
import {readFileSync}from'node:fs';
const root=new URL('../../',import.meta.url);
test('Cloud full release gate is BLOCKED by default without evidence',()=>{
 const gate=new URL('scripts/cloud-full-release-gate.mjs',root);
 const p=spawnSync(process.execPath,[gate.pathname],{cwd:new URL('.',root).pathname,encoding:'utf8'});
 assert.equal(p.status,2);const response=JSON.parse(p.stdout);
 assert.equal(response.decision,'BLOCKED');assert(response.unmet>=20);
 assert(response.missing.includes('cross_provider_move_live_e2e'));
 assert(response.missing.includes('shares_invite_revoke_live'));
 assert(response.missing.includes('production_build_node24'));
});
test('M3 does not enable hidden UI, OAuth or public runtime API',()=>{
 const rootScripts=readFileSync(new URL('package.json',root),'utf8');
 const manifest=JSON.parse(rootScripts);
 assert(!Object.values(manifest.scripts||{}).some(s=>String(s).includes('cloud-full-release-gate')));
 const routes=readFileSync(new URL('backend/cloud-integratie-routes.ts',root),'utf8');
 assert(!routes.includes('cloud-overdracht-m3-pg'));
});
