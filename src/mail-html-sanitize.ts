// HTML-sanitizing met DOMPurify voor mailvoorbeelden (fase B).
// - sanitizeDocumentHtml: geconverteerde documentbijlagen (docx/odt/rtf …) die met dangerouslySetInnerHTML
//   in de app-DOM worden gezet. Strikt: geen scripts, formulieren, frames, inline stijlen of externe bronnen.
// - sanitizeMailHtml: eerste laag voor de HTML-body van mails vóór de bestaande opschoning in
//   MailMessageBody.prepareHtml; die body draait daarna in een sandbox-iframe zonder allow-scripts.
import DOMPurify from 'dompurify';

const SAFE_LINK=/^(?:https?:|mailto:|tel:|#)/i;

let hookInstalled=false;
const ensureHooks=()=>{
  if(hookInstalled)return;
  hookInstalled=true;
  DOMPurify.addHook('afterSanitizeAttributes',node=>{
    if(node.tagName==='A'){
      const href=node.getAttribute('href')||'';
      if(href&&!SAFE_LINK.test(href.trim()))node.removeAttribute('href');
      node.setAttribute('target','_blank');
      node.setAttribute('rel','noopener noreferrer');
      node.setAttribute('referrerpolicy','no-referrer');
    }
  });
};

export const sanitizeDocumentHtml=(html:string)=>{
  ensureHooks();
  return DOMPurify.sanitize(String(html||''),{
    USE_PROFILES:{html:true},
    FORBID_TAGS:['style','script','form','input','button','textarea','select','option','iframe','frame','frameset','object','embed','link','meta','base','svg','math'],
    FORBID_ATTR:['style','srcset','action','formaction','ping'],
    ALLOW_DATA_ATTR:false,
    // Alleen afbeeldingen als data:/blob: (uit het document zelf), links naar http(s)/mailto/tel.
    ALLOWED_URI_REGEXP:/^(?:https?:|mailto:|tel:|#|data:image\/(?:png|jpe?g|gif|webp|bmp);base64,|blob:)/i,
  }) as string;
};

export const sanitizeMailHtml=(html:string)=>{
  ensureHooks();
  return DOMPurify.sanitize(String(html||''),{
    WHOLE_DOCUMENT:true,
    ADD_TAGS:['style'],
    FORBID_TAGS:['script','iframe','frame','frameset','object','embed','base','meta','link','input','button','textarea','select'],
    FORBID_ATTR:['srcdoc','action','formaction','ping','autofocus'],
    ALLOW_DATA_ATTR:false,
  }) as string;
};
