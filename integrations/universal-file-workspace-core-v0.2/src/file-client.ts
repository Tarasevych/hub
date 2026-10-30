/**
 * Embeddable client API. No provider URLs or OAuth credentials enter this layer.
 * Server issues short-lived opaque handles after source-side authorization.
 * POST routes are fixed and same-origin, authorization comes from HttpOnly session.
 */
export type ViewerOrigin = 'mail' | 'cloud' | 'github' | 'ai' | 'hub' | 'notes' | 'tasks' | 'local' | 'plugin';
export interface OpenIntent {
  handle: string;
  origin: ViewerOrigin;
  /** Purely internal route name, not a URL. UI maps it to navigation itself. */
  returnRoute?: string;
}
export interface RemoteFileInfo {
  handle: string;
  displayName: string;
  mime: string;
  family: string;
  size: number;
  revision: string;
  sourceLabel: string;
  accountLabel?: string;
  actions: readonly string[];
  engineId?: string;
  previewAvailable: boolean;
}
export interface ClientConfig {
  /** Inject same-origin fetch. For tests only; in browser use window.fetch bound to window. */
  fetcher: (input:RequestInfo | URL, init?:RequestInit)=>Promise<Response>;
  /** CSRF is read from application session state, never a URL or FileRef. */
  getCsrf:()=>string;
}
export class UniversalViewerClient {
  private readonly config:ClientConfig;
  constructor(config:ClientConfig){this.config=config;}
  private validateHandle(handle:string):void {
    if(!/^[A-Za-z0-9_-]{8,256}$/.test(handle)) throw new Error('INVALID_OPAQUE_HANDLE');
  }
  private async post(path:'inspect'|'content',data:unknown,signal?:AbortSignal):Promise<Response>{
    const csrf=this.config.getCsrf();
    if(!csrf)throw new Error('MISSING_CSRF_TOKEN');
    const response=await this.config.fetcher(`/api/owner/universal-files/v1/${path}`,{
      method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',mode:'same-origin',signal,
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)
    });
    if(!response.ok){
      // Provider or HTML error messages may contain sensitive data; do not pass through.
      if(response.status===401)throw new Error('AUTH_REQUIRED');
      if(response.status===403)throw new Error('ACCESS_DENIED');
      if(response.status===404)throw new Error('FILE_NOT_FOUND');
      if(response.status===409)throw new Error('SOURCE_REVISION_CHANGED');
      if(response.status===429)throw new Error('RETRY_LATER');
      throw new Error('FILE_SERVICE_UNAVAILABLE');
    }
    return response;
  }
  async open(intent:OpenIntent,signal?:AbortSignal):Promise<RemoteFileInfo>{
    this.validateHandle(intent.handle);
    const allowed:ViewerOrigin[]=['mail','cloud','github','ai','hub','notes','tasks','local','plugin'];
    if(!allowed.includes(intent.origin))throw new Error('INVALID_VIEWER_ORIGIN');
    const response=await this.post('inspect',{handle:intent.handle,origin:intent.origin},signal);
    const result=await response.json() as RemoteFileInfo;
    if(result.handle!==intent.handle)throw new Error('FILE_HANDLE_MISMATCH');
    return result;
  }
  /** One range only; caller owns pagination/zoom. Content never written to localStorage. */
  async readRange(handle:string,start:number,length:number,signal?:AbortSignal):Promise<Uint8Array>{
    this.validateHandle(handle);
    if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(length)||length<1||length>256*1024)throw new Error('INVALID_RANGE');
    const response=await this.post('content',{handle,start,length},signal);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength>length)throw new Error('RANGE_TOO_LARGE');
    return bytes;
  }
}
