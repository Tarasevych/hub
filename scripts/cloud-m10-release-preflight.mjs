/**
 * M10 Cloud release preflight. Explicitly NOT a production certification.
 * Safe to invoke in development, CI or prior to a deployment proposal.
 * Missing evidence ALWAYS prevents an installable release.
 * This checks composition/entrypoints; live auth, provider operations and
 * cryptographic assurance must be separately certified by independent CI.
 */
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash,verify,createPublicKey} from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const source=(name)=>{try{return readFileSync(resolve(root,name),'utf8');}catch{return '';}};
const gate=source('scripts/cloud-full-release-gate.mjs');
const backend=source('backend/cloud-platform.ts');
const cloudUi=source('src/CloudFunctioneelWeergave.tsx');
const nav=source('src/VerenigdDienstApp.tsx');
const admin=source('src/BeheerConsoleWeergave.tsx');
const m8=source('backend/cloud-m8-routes.ts');
const m9=source('backend/cloud-m9-directory-composition.ts');
const pkg=source('package.json');
const version=source('UITROL-VERSIE').trim();
const check=(id,passed,detail)=>({id,passed:Boolean(passed),detail});
const checks=[
 check('base-release',version>='20261028-131829','Preserve supplied baseline 20261028-131829 and later'),
 check('existing-ufw-v0.3',source('src/bestand/UniverseelBestandVenster.tsx').includes('MailAttachmentPreviewContent'),'Reuse existing preview; do not remove'),
 check('existing-google-drive',source('src/DriveBrowser.tsx').includes('drive-browser'),'Keep established Google Drive workbench'),
 check('cloud-api-wiring', ['createCloudIntegratieRoutes','createM4CloudRoutes','createM5ProviderCatalogueRoutes','createCloudM6AdminRoutes','createM8CloudRoutes'].every(x=>backend.includes(x)),'Existing integration factories are registered'),
 check('all-eleven-directory-drivers',m9.includes('createCloudM9DirectoryDrivers')&&m9.includes('S3CompatibleDirectory')&&m9.includes('GithubDirectory'),'Eleven provider driver classes exist'),
 check('staged-account-ui',cloudUi.includes('<CloudVerbindingCentrumM4')&&cloudUi.includes('<CloudAanbiedersM5'),'Account and provider UI mounted only in staging'),
 check('staged-file-ui',cloudUi.includes('<CloudM10Verkenner')&&nav.includes("id:'files'")&&source('src/cloud/CloudM10Verkenner.tsx').includes('directory/list'),'User multi-account file browser is reachable in staging'),
 check('stage-is-disabled-by-default',cloudUi.includes("VITE_CLOUD_FULL_STAGING === 'enabled'")&&nav.includes("VITE_CLOUD_FULL_STAGING === 'enabled'"),'Existing production UI remains unchanged'),
 check('bounded-http-json',source('backend/cloud-m8-directory.ts').includes('await boundedText(response)')&&source('backend/cloud-m8-directory.ts').includes('await boundedText(r)'),'Directory response bounded before decoding'),
 check('m8-live-runtime-injected',backend.includes('const stagedDirectory=createM10StagingDirectoryRuntime()')&&backend.includes('createM8CloudRoutes(authorize,stagedDirectory)')&&source('backend/cloud-m10-runtime.ts').includes('store.list('),'Scoped staging runtime is instantiated only after explicit opt-in; this does not prove live providers'),
 check('all-eleven-runtime-resolvers-live',false,'Only five signed-in provider types are wired for directory browsing; other credential and folder resolvers unverified'),
 check('admin-ui-on-protected-admin-host',admin.includes('<CloudM10Governance')&&source('backend/index.ts').includes('createM10CloudAdminRoutes')&&source('backend/cloud-m10-admin-bridge.ts').includes("a.service!=='admin'"),'Operator UI and protected admin routes are staged under admin service'),
 check('server-worker-and-recovery-wired',source('backend/cloud-platform.ts').includes('cloudM9JobWorker')&&source('backend/cloud-platform.ts').includes('cloudTransferRunner'),'Durable job runner, leases and recovery wired'),
 check('actual-binary-preview-route',backend.includes('createM11CloudPreviewRoutes(authorize,createM11StagingPreviewRuntime(stagedDirectory))')&&source('backend/cloud-m11-preview-routes.ts').includes("CLOUD_M11_PREVIEW_STAGING==='enabled'")&&source('backend/cloud-m11-preview.ts').includes('SERVER_DELEGATED_NOT_E2EE'),'Bounded server-authorized binary route exists in staging; no real-account live E2E'),
 check('cloud-provider-oauth-live',false,'Requires independent consent, scopes, refresh and revoke verification for every provider'),
 check('cross-provider-copy-move-live',false,'Requires real E2E for streaming, retry, readback checksum, conditional deletion'),
 check('sharing-and-version-restore-live',false,'Requires every declared provider and account-policy variant'),
 check('cross-browser-device-live',false,'Requires multiple sessions, same-provider accounts and space separation'),
 check('independent-client-key-audit-live',false,'Owner-controlled JavaScript is not zero-knowledge; requires independently verified client'),
 check('node24-build-staging-migrations-e2e',false,'Node.js 24+ build, migration rollback and browser E2E evidence missing')
];
// Independently signed CI attestations: optional extra proof, never a substitute
// for failing structural/composition checks. Key must be pinned in trusted CI,
// never accepted from an uploaded archive or request body.
let attestation={valid:false,reason:'MISSING_INDEPENDENT_ATTESTATION'};
const attPath=process.env.CLOUD_CI_ATTESTATION_PATH||'';
const keyPath=process.env.CLOUD_TRUSTED_CI_ED25519_PUBLIC_KEY_PATH||'';
if(attPath&&keyPath&&existsSync(attPath)&&existsSync(keyPath)){
 try{
  const obj=JSON.parse(readFileSync(attPath,'utf8'));
  const bytes=Buffer.from(obj.payloadBase64||'','base64');
  const signature=Buffer.from(obj.signatureBase64||'','base64');
  const key=createPublicKey(readFileSync(keyPath));
  const payload=JSON.parse(bytes.toString('utf8'));
  const expires=Date.parse(payload.expiresAt||'');
  const evidence=Array.isArray(payload.evidence)?payload.evidence:[];
  const allIds=new Set(checks.map(c=>c.id));
  const critical=evidence.filter(e=>allIds.has(e.checkId));
  const hash=createHash('sha256').update(source('UITROL-VERSIE')).digest('hex');
  const valid=key.asymmetricKeyType==='ed25519'&&verify(null,bytes,key,signature)&&
   payload.baseVersion===version&&payload.versionFileSha256===hash&&
   Number.isFinite(expires)&&expires>Date.now()&&expires<Date.now()+7*86400000&&critical.length>0;
  attestation={valid,reason:valid?'CRYPTOGRAPHIC_SIGNATURE_VALID':'ATTESTATION_REJECTED'};
 }catch{attestation={valid:false,reason:'ATTESTATION_REJECTED'};}
}
// This audit has no mechanism for untrusted JSON to override check results.
const failures=checks.filter(c=>!c.passed);
const ready=failures.length===0&&attestation.valid&&gate.includes('REQUIRED=');
const output={baseVersion:version,mode:'INDEPENDENT_DEVELOPMENT_AUDIT',decision:ready?'READY_FOR_FINAL_STAGING_REVIEW':'BLOCKED',
 summary:{passed:checks.length-failures.length,total:checks.length,failed:failures.length},checks,attestation,
 note:'A signed CI payload cannot override missing runtime integrations or real-provider E2E.'};
console.log(JSON.stringify(output,null,2));
process.exitCode=ready?0:2;
