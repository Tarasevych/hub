/** Cloud Full Integration · eerste verticale slice (28-10-2026).
 * Pure domain rules. No authentication bypass, no provider tokens, no mock success.
 * All decisions MUST be recomputed on the server before a mutation.
 */
export const CLOUD_AKTIES = [
  'list','search','read','preview','download','upload','createFolder','rename','copy','move',
  'delete','restore','share','revoke','versions','edit'
] as const;
export type CloudAktie = typeof CLOUD_AKTIES[number];
export type CloudRuimte = 'prive' | 'technisch';
export type CloudAanbieder = 'cloud-native' | 'google-drive' | 'onedrive-personal' | 'onedrive-business' |
  'sharepoint' | 'dropbox' | 'nextcloud' | 'box' | 'github' | 's3' | 'backblaze-b2' | 'pcloud' | 'local';
export type CloudBestandRef = {
  aanbieder: CloudAanbieder; accountId: string; bestandId: string;
  ruimte: CloudRuimte; revisie?: string;
};
export type CloudSteun =
  | { kind: 'native'; enabled: true; technique: string }
  | { kind: 'gateway'; enabled: true; technique: string; warnings: string[] }
  | { kind: 'needs-consent'; enabled: false; missingScopes: string[] }
  | { kind: 'forbidden' | 'unavailable' | 'temporarily-unavailable'; enabled: false; reason: string; retryable?: boolean };
export type CloudMogelijkheden = Record<CloudAktie, CloudSteun>;
export type CloudMogelijkhedenAntwoord = {
  bron: CloudBestandRef; bestand: { naam: string; mimeType: string; grootte: number | null; isMap: boolean; revisie: string };
  acties: CloudMogelijkheden; checkedAt: string; freshness: 'live';
};
export type GoogleDriveRechten = {
  canDownload?: boolean; canCopy?: boolean; canEdit?: boolean; canDelete?: boolean;
  canTrash?: boolean; canMoveItemWithinDrive?: boolean; canShare?: boolean; canRename?: boolean;
  canAddChildren?: boolean; canReadRevisions?: boolean;
};
export type GoogleDriveMetadata = {
  id?: string; name?: string; mimeType?: string; size?: string; md5Checksum?: string;
  version?: string; modifiedTime?: string; trashed?: boolean; capabilities?: GoogleDriveRechten;
};
export const geenSteun = (reason: string): CloudSteun => ({ kind: 'unavailable', enabled: false, reason });
export const verboden = (reason: string): CloudSteun => ({ kind: 'forbidden', enabled: false, reason });
export const native = (technique: string): CloudSteun => ({ kind: 'native', enabled: true, technique });
export const gateway = (technique: string, warnings: string[]): CloudSteun => ({kind:'gateway',enabled:true,technique,warnings});
export function alleGeblokkeerd(reason: string): CloudMogelijkheden {
  return Object.fromEntries(CLOUD_AKTIES.map(actie => [actie, geenSteun(reason)])) as CloudMogelijkheden;
}
export const CLOUD_NATIEF_MAX = 6 * 1024 * 1024;
/** Limit matches existing Cloud capture's allowedMime whitelist; not a universal file quota. */
export function veiligVoorCloudImport(mime: string, size: number | null): boolean {
  const bekend = /^(image\/(?:jpeg|png|webp|gif)|video\/mp4|application\/(?:pdf|zip|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.oasis\.opendocument\.(?:text|spreadsheet|presentation))|text\/(?:plain|csv|markdown))$/i.test(mime);
  return bekend && size !== null && size > 0 && size <= CLOUD_NATIEF_MAX;
}
export function googleBestandMogelijkheden(file: GoogleDriveMetadata): CloudMogelijkheden {
  const actions=alleGeblokkeerd('NOT_IMPLEMENTED_IN_UNIFIED_ENGINE');
  if (file.trashed) return alleGeblokkeerd('RESOURCE_IN_TRASH');
  const folder=file.mimeType==='application/vnd.google-apps.folder';
  const nativeDoc=String(file.mimeType||'').startsWith('application/vnd.google-apps.') && !folder;
  const caps=file.capabilities||{};
  actions.read=folder?verboden('FOLDER_NOT_A_FILE'):caps.canDownload===true?native(nativeDoc?'google_drive_files_export':'google_drive_files_get'):verboden('GOOGLE_DOWNLOAD_NOT_PERMITTED');
  actions.download=actions.read;
  actions.preview=geenSteun('UNIFIED_PREVIEW_NOT_PUBLISHED');
  actions.copy=geenSteun(caps.canCopy===true?'COPY_ADAPTER_NOT_WIRED':'GOOGLE_COPY_NOT_PERMITTED');
  actions.delete=caps.canDelete===true?native('existing_drive_files_update_trashed'):verboden('GOOGLE_DELETE_NOT_PERMITTED');
  actions.rename=caps.canEdit===true&&caps.canRename===true?native('existing_drive_files_patch'):verboden('GOOGLE_RENAME_NOT_PERMITTED');
  actions.share=geenSteun(caps.canShare===true?'SHARING_ADAPTER_NOT_WIRED':'GOOGLE_SHARING_NOT_PERMITTED');
  actions.versions=geenSteun(caps.canReadRevisions===true?'REVISIONS_ADAPTER_NOT_WIRED':'GOOGLE_REVISIONS_UNAVAILABLE');
  // Explicitly NOT promised by the first slice: must be implemented and tested first.
  actions.move=geenSteun('CROSS_PROVIDER_MOVE_NOT_READY');
  actions.edit=geenSteun('OFFICE_SAVE_BACK_NOT_READY');
  actions.revoke=geenSteun('UNIFIED_SHARING_REVOKE_NOT_READY');
  return actions;
}
export type CloudOverdrachtVerzoek = {
  mode: 'copy' | 'move'; bron: CloudBestandRef; doel: {
    aanbieder: CloudAanbieder; accountId: string; ruimte: CloudRuimte; mapId?: string;
  };
};
export type CloudOverdrachtPlan = {
  decision: 'blocked' | 'needs-consent' | 'ready';
  reasonCodes: string[]; sourceVerified: boolean; targetVerified: boolean;
  deleteOriginal: boolean; warnings: string[]; operation: 'copy' | 'move';
};
/** Central engine never infers scope/ACL from provider name. A missing proof blocks transfer. */
export function beoordeelOverdracht(input: CloudOverdrachtVerzoek, evidence: {
  bronLezen: CloudSteun; doelSchrijven: CloudSteun;
  sourceLive: boolean; targetLive: boolean; userConfirmedMove: boolean;
  resourceCompatible: boolean; authenticatedSameOwnerAndSpace: boolean;
  executorReady: boolean;
}): CloudOverdrachtPlan {
  const reasons:string[]=[];
  if (!evidence.authenticatedSameOwnerAndSpace || input.bron.ruimte!==input.doel.ruimte) reasons.push('SPACE_OR_OWNER_MISMATCH');
  if (!evidence.sourceLive || !evidence.targetLive) reasons.push('PROVIDER_NOT_VERIFIED_LIVE');
  if (!evidence.bronLezen.enabled) reasons.push(evidence.bronLezen.kind==='needs-consent'?'SOURCE_NEEDS_CONSENT':'SOURCE_READ_FORBIDDEN');
  if (!evidence.doelSchrijven.enabled) reasons.push(evidence.doelSchrijven.kind==='needs-consent'?'TARGET_NEEDS_CONSENT':'TARGET_WRITE_FORBIDDEN');
  if (!evidence.resourceCompatible) reasons.push('FORMAT_OR_SIZE_NOT_SUPPORTED');
  if (input.mode==='move' && !evidence.userConfirmedMove) reasons.push('MOVE_REQUIRES_EXPLICIT_CONFIRMATION');
  if (!evidence.executorReady) reasons.push('TRANSFER_EXECUTOR_NOT_READY');
  return {decision:reasons.length?'blocked':'ready',reasonCodes:reasons,sourceVerified:evidence.sourceLive,targetVerified:evidence.targetLive,
    deleteOriginal:input.mode==='move'&&reasons.length===0,
    warnings:input.mode==='move'?['DELETE_ORIGINAL_ONLY_AFTER_VERIFIED_COPY']:['SOURCE_LEFT_UNCHANGED'], operation:input.mode};
}
/** Public contract: never create a transfer by pretending that planning means execution. */
export function providerStatus(id: CloudAanbieder, connected: boolean, implementationReady: boolean) {
  return {id, status: !implementationReady?'not-implemented':connected?'connected':'needs-connection',
    ready: implementationReady&&connected};
}
