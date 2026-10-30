import type { ActorContext, FileRef, FileSignature, Operation, RendererManifest, SourceAdapter, ViewerDecision, SourceKind } from './contracts.js';
import { detectFile } from './sniff.js';
const active = new Set<Operation>(['preview','download','save-copy','edit','print','share','convert','merge','split','verify-signature']);
export class SourceRegistry {
  private adapters = new Map<SourceKind, SourceAdapter>();
  register(adapter:SourceAdapter):void { if(this.adapters.has(adapter.kind)) throw new Error('DUPLICATE_ADAPTER'); this.adapters.set(adapter.kind,adapter); }
  get(kind:SourceKind):SourceAdapter {const a=this.adapters.get(kind); if(!a) throw new Error('SOURCE_NOT_CONNECTED'); return a;}
  list():SourceKind[]{return [...this.adapters.keys()];}
}
export class EngineRegistry {
  private engines=new Map<string,RendererManifest>();
  register(engine:RendererManifest):void { if(this.engines.has(engine.id)) throw new Error('DUPLICATE_ENGINE'); this.engines.set(engine.id,structuredClone(engine)); }
  setEnabled(id:string,enabled:boolean):void {const engine=this.engines.get(id); if(!engine) throw new Error('ENGINE_NOT_FOUND');this.engines.set(id,{...engine,enabled});}
  list():RendererManifest[]{return [...this.engines.values()].sort((a,b)=>a.priority-b.priority);}
  choose(signature:FileSignature,operation:Operation='preview'):RendererManifest|null {
    if(!active.has(operation) || signature.executableRisk && operation==='edit')return null;
    return this.list().find(x=>x.enabled && x.status==='supported' && x.families.includes(signature.family) && x.operations.includes(operation))??null;
  }
}
export function assertOwnerScoped(actor:ActorContext,ref:FileRef,operation:Operation):void {
  if(!actor.actorId || actor.ownerId!==ref.ownerId || actor.space!==ref.space) throw new Error('ACCESS_DENIED_OWNER_OR_SPACE');
  if(!actor.allowedSources.has(ref.source) || !actor.allowedConnections.has(ref.connectionId)) throw new Error('ACCESS_DENIED_SOURCE');
  if(!actor.allowedOperations.has(operation)) throw new Error('ACCESS_DENIED_OPERATION');
  if(/^(https?:\/\/|file:\/\/|\/|\.\.)/i.test(ref.id)) throw new Error('INVALID_OPAQUE_FILE_ID');
}
export async function resolveViewer(source:SourceRegistry,engines:EngineRegistry,ref:FileRef,actor:ActorContext):Promise<ViewerDecision> {
  assertOwnerScoped(actor,ref,'preview');
  const adapter=source.get(ref.source);
  const latest=await adapter.stat(ref,actor);
  if(latest.ownerId!==actor.ownerId || latest.space!==actor.space || latest.source!==ref.source || latest.connectionId!==ref.connectionId) throw new Error('UNTRUSTED_METADATA_SCOPE');
  const start=await adapter.readRange(latest,actor,0,Math.min(4096,latest.size??4096));
  if(start.bytes.byteLength>4096) throw new Error('ADAPTER_RANGE_VIOLATION');
  const sig=detectFile(latest.displayName,latest.declaredMime,start.bytes);
  const engine=engines.choose(sig);
  const actions=(engine?.operations??[]).filter(o=>actor.allowedOperations.has(o)) as Operation[];
  return {ref:latest,signature:sig,renderer:engine,enabledActions:actions,reason:engine?undefined:'NO_ENABLED_SAFE_PREVIEW_ENGINE'};
}
