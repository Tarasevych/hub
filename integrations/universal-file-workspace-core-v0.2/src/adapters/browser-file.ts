import type { ActorContext, FileRef, Operation, RangeResponse, SaveRequest, SourceAdapter } from '../contracts.js';

/**
 * Browser-local, explicitly user-selected files. No filesystem discovery or persistent storage.
 * The caller must obtain the File via a trusted input/drop gesture and register it here.
 * This adapter is used in a single browser session, NOT a general server-side source.
 */
export class BrowserFileSource implements SourceAdapter {
  readonly kind = 'browser-file' as const;
  private files = new Map<string, {blob:Blob; ref:FileRef}>();
  private counter=0;

  add(blob:Blob, name:string, scope:Pick<FileRef,'ownerId'|'space'|'connectionId'>):FileRef {
    if(!name || !scope.ownerId || !scope.connectionId) throw new Error('INVALID_FILE_SCOPE');
    const id=`local-${++this.counter}-${crypto.randomUUID()}`;
    const ref:FileRef={id,source:this.kind,...scope,displayName:name,size:blob.size,declaredMime:blob.type || undefined,revision:id};
    this.files.set(id,{blob,ref});
    return {...ref};
  }
  getBlob(ref:FileRef,actor:ActorContext):Blob {return this.checked(ref,actor).blob;}
  remove(id:string):void {this.files.delete(id);}
  clear():void {this.files.clear();}
  async stat(ref:FileRef,actor:ActorContext):Promise<FileRef> {
    const entry=this.checked(ref,actor);
    return {...entry.ref};
  }
  async readRange(ref:FileRef,actor:ActorContext,start:number,endExclusive:number):Promise<RangeResponse> {
    const entry=this.checked(ref,actor);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(endExclusive)||start<0||endExclusive<start) throw new Error('INVALID_RANGE');
    const bytes=new Uint8Array(await entry.blob.slice(start,endExclusive).arrayBuffer());
    return {bytes,totalSize:entry.blob.size,etag:entry.ref.revision,contentType:entry.ref.declaredMime};
  }
  async getOperations(ref:FileRef,actor:ActorContext):Promise<readonly Operation[]> {
    this.checked(ref,actor);
    return ['preview','download'];
  }
  private checked(ref:FileRef,actor:ActorContext){
    const entry=this.files.get(ref.id);
    if(!entry) throw new Error('FILE_NOT_FOUND');
    if(entry.ref.ownerId!==actor.ownerId||entry.ref.space!==actor.space||entry.ref.connectionId!==ref.connectionId||ref.ownerId!==actor.ownerId||ref.space!==actor.space||entry.ref.source!==ref.source) throw new Error('ACCESS_DENIED_LOCAL_FILE');
    return entry;
  }
}
