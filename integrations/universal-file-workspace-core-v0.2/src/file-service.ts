import type { ActorContext, FileRef, FileSignature, Operation, RangeResponse, RendererManifest, SourceAdapter } from './contracts.js';
import { assertOwnerScoped, EngineRegistry, SourceRegistry } from './registry.js';
import { detectFile } from './sniff.js';

export type ViewContent =
  | {kind:'text'; mime:string; text:string; truncated:boolean}
  | {kind:'blob'; mime:string; bytes:Uint8Array; truncated:boolean}
  | {kind:'metadata'; mime:string; reason:string};

export interface RuntimeEngine {
  id:string;
  prepare:(bytes:Uint8Array,ref:FileRef,signature:FileSignature,truncated:boolean)=>Promise<ViewContent>;
  /** No open-coded HTML evaluation; UI MUST use textContent for kind:text. */
}
export interface FileInspection {
  ref:FileRef;
  signature:FileSignature;
  engine:RendererManifest|null;
  actions:Operation[];
  previewAvailable:boolean;
  reason?:string;
}

/** The host is required to supply a trusted session ActorContext. Never trust one from JSON. */
export class UniversalFileService {
  private runtimes=new Map<string,RuntimeEngine>();
  constructor(readonly sources:SourceRegistry,readonly engines:EngineRegistry){}
  registerRuntime(runtime:RuntimeEngine):void {
    if(this.runtimes.has(runtime.id)) throw new Error('DUPLICATE_RUNTIME');
    if(!this.engines.list().some(e=>e.id===runtime.id)) throw new Error('RUNTIME_WITHOUT_MANIFEST');
    this.runtimes.set(runtime.id,runtime);
  }
  availableEngines():string[]{return [...this.runtimes.keys()];}
  /** Inspect never downloads entire content and never claims a manifest-only engine is functional. */
  async inspect(ref:FileRef,actor:ActorContext):Promise<FileInspection> {
    assertOwnerScoped(actor,ref,'preview');
    const adapter=this.sources.get(ref.source);
    const actual=await this.verifiedStat(ref,actor,adapter);
    const start=await this.safeRange(adapter,actual,actor,0,Math.min(4096,actual.size ?? 4096));
    const signature=detectFile(actual.displayName,actual.declaredMime,start.bytes);
    const chosen=this.engines.list().find(e=>
      e.enabled && e.status==='supported' && e.families.includes(signature.family)
      && e.operations.includes('preview') && this.runtimes.has(e.id)
      && !(signature.executableRisk && e.id==='safe-native-media')) ?? null;
    const permittedBySource=new Set(await (adapter.getOperations?.(actual,actor) ?? Promise.resolve(['preview','download'] as Operation[])));
    const actions:Operation[]=[];
    for(const op of ['preview','download','print','save-copy','edit','share','convert','merge','split','verify-signature'] as Operation[]){
      if(!actor.allowedOperations.has(op)||!permittedBySource.has(op)) continue;
      if(op==='preview' && !chosen)continue;
      if(op==='edit' && !adapter.saveVersion)continue;
      if(op!=='preview' && op!=='download' && !chosen?.operations.includes(op)) continue;
      actions.push(op);
    }
    return {ref:actual,signature,engine:chosen,actions,previewAvailable:!!chosen,
      reason: chosen ? undefined : 'PREVIEW_ENGINE_NOT_INSTALLED'};
  }
  /** In-memory, bounded read; for larger files use a streaming renderer or lower fidelity fallback. */
  async preview(ref:FileRef,actor:ActorContext,opts:{maxBytes?:number;signal?:AbortSignal}={}):Promise<{info:FileInspection;content:ViewContent}> {
    const info=await this.inspect(ref,actor);
    if(!info.engine||!info.actions.includes('preview')) throw new Error('NO_AUTHORIZED_PREVIEW_ENGINE');
    const limit=opts.maxBytes ?? 8*1024*1024;
    if(!Number.isSafeInteger(limit)||limit<1||limit>32*1024*1024) throw new Error('INVALID_PREVIEW_LIMIT');
    const cap=Math.min(limit,info.engine.maxPreviewBytes ?? limit);
    const adapter=this.sources.get(info.ref.source);
    const {bytes,truncated}=await this.collect(adapter,info.ref,actor,cap,opts.signal);
    const runtime=this.runtimes.get(info.engine.id);
    if(!runtime) throw new Error('ENGINE_REMOVED');
    return {info,content:await runtime.prepare(bytes,info.ref,info.signature,truncated)};
  }
  /** Strict bounded transport with revision consistency and cancellation. */
  async collect(adapter:SourceAdapter,ref:FileRef,actor:ActorContext,maxBytes:number,signal?:AbortSignal):Promise<{bytes:Uint8Array;truncated:boolean}> {
    assertOwnerScoped(actor,ref,'preview');
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32*1024*1024) throw new Error('INVALID_READ_LIMIT');
    const blocks:Uint8Array[]=[];let offset=0;let total:number|undefined=ref.size;
    while(offset<maxBytes && (total===undefined || offset<total)) {
      if(signal?.aborted)throw new Error('ABORTED');
      const next=Math.min(offset+256*1024,maxBytes,total ?? maxBytes);
      const part=await this.safeRange(adapter,ref,actor,offset,next);
      if(ref.revision && part.etag && part.etag!==ref.revision)throw new Error('SOURCE_REVISION_CHANGED');
      if(part.totalSize!==undefined) {
        if(!Number.isSafeInteger(part.totalSize)||part.totalSize<0) throw new Error('INVALID_TOTAL_SIZE');
        if(total!==undefined && total!==part.totalSize) throw new Error('SOURCE_SIZE_CHANGED');
        total=part.totalSize;
      }
      if(part.bytes.length===0) {
        if(total!==undefined && offset<total)throw new Error('TRUNCATED_SOURCE');
        break;
      }
      blocks.push(part.bytes);offset+=part.bytes.length;
      if(part.bytes.length<next-(offset-part.bytes.length) && total!==undefined && offset<total)throw new Error('SHORT_RANGE_RESPONSE');
    }
    const result=new Uint8Array(offset);let at=0;
    for(const block of blocks){result.set(block,at);at+=block.length;}
    return {bytes:result,truncated:total===undefined?offset===maxBytes:offset<total};
  }
  private async verifiedStat(ref:FileRef,actor:ActorContext,adapter:SourceAdapter):Promise<FileRef> {
    const resolved=await adapter.stat(ref,actor);
    if(resolved.id!==ref.id||resolved.ownerId!==actor.ownerId||resolved.space!==actor.space||resolved.source!==ref.source||resolved.connectionId!==ref.connectionId) throw new Error('UNTRUSTED_METADATA_SCOPE');
    if(resolved.size!==undefined && (!Number.isSafeInteger(resolved.size)||resolved.size<0))throw new Error('INVALID_METADATA_SIZE');
    return resolved;
  }
  private async safeRange(adapter:SourceAdapter,ref:FileRef,actor:ActorContext,start:number,endExclusive:number):Promise<RangeResponse> {
    assertOwnerScoped(actor,ref,'preview');
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(endExclusive)||start<0||endExclusive<start||endExclusive-start>256*1024)throw new Error('INVALID_RANGE');
    const r=await adapter.readRange(ref,actor,start,endExclusive);
    if(!(r.bytes instanceof Uint8Array)||r.bytes.length>endExclusive-start)throw new Error('ADAPTER_RANGE_VIOLATION');
    if(ref.revision && r.etag && r.etag!==ref.revision)throw new Error('SOURCE_REVISION_CHANGED');
    return r;
  }
}

/** Safe-by-construction minimal implementations: others are manifest-only until actually installed. */
export function builtInSafeRuntimes():RuntimeEngine[] {
  const text=(kind:string):RuntimeEngine=>({id:kind,async prepare(bytes,ref,sig,truncated){
    return {kind:'text',mime:sig.mime,text:new TextDecoder('utf-8',{fatal:false}).decode(bytes),truncated};
  }});
  return [text('safe-text'),{id:'safe-native-media',async prepare(bytes,ref,sig,truncated){
    return {kind:'blob',mime:sig.mime,bytes,truncated};
  }}];
}
