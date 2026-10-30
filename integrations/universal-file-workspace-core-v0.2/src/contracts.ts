/** Shared source-agnostic contracts. No OAuth secrets, access tokens or provider URLs in FileRef. */
export type SourceKind =
  | 'gmail' | 'microsoft-mail' | 'google-drive' | 'onedrive' | 'dropbox'
  | 'private-cloud' | 'github' | 'gitlab' | 'device-agent'
  | 'browser-file' | 'hub-task' | 'hub-note' | 'plugin';

export type FileFamily = 'pdf' | 'word' | 'spreadsheet' | 'presentation' | 'image'
  | 'archive' | 'signature' | 'calendar' | 'contact' | 'audio' | 'video'
  | 'text' | 'code' | 'email' | 'font' | 'binary';
export type Operation = 'preview' | 'download' | 'save-copy' | 'edit' | 'print'
  | 'share' | 'convert' | 'merge' | 'split' | 'verify-signature';
export type Capability = 'supported' | 'partial' | 'unsupported' | 'blocked';
export type SessionSpace = 'private' | 'technical';
export type AccessMode = 'read' | 'write' | 'admin';
export interface FileRef {
  id: string;                       // opaque, source-owned identifier, NEVER a URL or raw path
  source: SourceKind;
  connectionId: string;             // opaque, account-scoped, not an OAuth token
  ownerId: string;
  space: SessionSpace;
  displayName: string;
  declaredMime?: string;
  size?: number;
  revision?: string;                // ETag/hash or provider revision, opaque
  parentId?: string;
  contextLabel?: string;            // email subject, repo/path, folder breadcrumb
}
export interface FileSignature {
  family: FileFamily;
  confidence: 'high' | 'medium' | 'low';
  reason: 'magic' | 'container' | 'mime' | 'extension' | 'fallback';
  mime: string;
  executableRisk: boolean;
}
export interface ActorContext {
  actorId: string;
  ownerId: string;
  space: SessionSpace;
  allowedSources: ReadonlySet<SourceKind>;
  allowedConnections: ReadonlySet<string>;
  allowedOperations: ReadonlySet<Operation>;
}
export interface RangeResponse {
  bytes: Uint8Array;
  totalSize?: number;
  etag?: string;
  contentType?: string;
}
export interface SaveRequest {
  sourceRevision?: string;
  expectedHash?: string;
  bytes: Uint8Array;
  mime: string;
  idempotencyKey: string;
}
export interface SourceAdapter {
  readonly kind: SourceKind;
  stat(ref: FileRef, actor: ActorContext): Promise<FileRef>;
  readRange(ref: FileRef, actor: ActorContext, start: number, endExclusive: number): Promise<RangeResponse>;
  /** Must preserve original source if no write rights; can be omitted for read-only connectors. */
  saveVersion?(ref: FileRef, actor: ActorContext, request: SaveRequest): Promise<{revision: string}>;
  /** Per-file/source capability, evaluated on each request. Defaults to preview/download only. */
  getOperations?(ref: FileRef, actor: ActorContext): Promise<readonly Operation[]>;
}
export interface RendererManifest {
  id: string;
  version: string;
  displayName: string;
  families: readonly FileFamily[];
  priority: number;                 // primary preferred engine, lower than fallback  
  operations: readonly Operation[];
  trust: 'browser-native' | 'audited-package' | 'isolated-worker' | 'server-sandbox';
  /** Browser preview may use thumbnails or sanitized HTML, never execute user-supplied scripts. */
  maxPreviewBytes?: number;
  enabled: boolean;
  status: Capability;
}
export interface ViewerDecision {
  ref: FileRef;
  signature: FileSignature;
  renderer: RendererManifest | null;
  enabledActions: Operation[];
  reason?: string;
}
