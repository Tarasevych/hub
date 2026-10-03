import{Check,Paperclip}from'lucide-react';import{lazy,Suspense,useLayoutEffect,useRef,useState,type CSSProperties}from'react';import type{MailAttachment,MailAttachmentPreview}from'./MailAttachmentPreview';import MailRowQuickActions from'./MailRowQuickActions';import StableAvatar from'./StableAvatar';import MailOrderedDensityBlocks from'./MailOrderedDensityBlocks';import MailMinimumMessageRow from'./MailMinimumMessageRow';import type{MailRowQuickActionProfile}from'./MailQuickSettings';import type{MailDateMode,MailDensityProfile,MailTextStyle}from'./mail-density-profile';import type{PrefetchPriority}from'./visible-prefetch';import'./mail-thread-editor.css';const MailAttachmentStrip=lazy(()=>import('./MailAttachmentPreview').then(module=>({default:module.MailAttachmentStrip})));type Density='minimum'|'normal'|'detailed'|'bulky';type Message={id:string;threadId:string;from:string;subject:string;snippet:string;receivedAt:number;unread:boolean;starred:boolean;sourceAccountId?:string;relevancePercent?:number};type Props={lang:'uk'|'nl';message:Message;attachments:MailAttachment[];density:Density;profile:MailDensityProfile;selected:boolean;busy:boolean;loadingKey:string;attachmentCacheScope:string;attachmentCacheVersion:number;dateText:string;unknownSender:string;noSubject:string;selectLabel:string;accountLabel?:string;lastViewed?:boolean;selectable?:boolean;actionsEnabled?:boolean;rowTone?:string;starColor?:string;labelNames?:string[];important?:boolean;minimumPreviewActive?:boolean;onMinimumPreviewChange?:(open:boolean,kind?:'indicator'|'preview')=>void;snoozedUntil?:number;providerSnoozed?:boolean;providerSnoozeObservedAt?:number;unsubscribeAvailable?:boolean;classificationKind?:'people'|'system';classificationManual?:''|'message'|'sender';classificationReason?:string;classificationSender?:string;highlightTerms?:string[];quickActions:MailRowQuickActionProfile;attentionKind?:'important'|'ordinary';senderColor?:string;senderAvatar?:string;senderColorBusy?:boolean;skeleton?:boolean;onSenderColor?:(color:string)=>void;onOpen:()=>void;onToggle:()=>void;onEnterSelection?:()=>void;onStar:()=>void;onPrefetch:(priority:PrefetchPriority)=>void;onAttachment:(item:MailAttachment)=>void;onAttachmentHoverPreview?:(item:MailAttachment)=>Promise<MailAttachmentPreview|null>;onAction:(action:'archive'|'trash'|'read'|'unread')=>void;onSnooze:(until:number)=>void;onCancelSnooze:()=>void;onUnsubscribe:()=>void;onPromoteMessage?:()=>void;onPromoteSender?:()=>void;onClassifySender?:(kind:'people'|'system')=>void;onAttention?:(kind:'important'|'ordinary')=>void;onClearClassification?:()=>void};const sender=(value:string,fallback:string)=>{const match=value.match(/^(.*?)\s*<([^>]+)>\s*$/),email=(match?.[2]||(/^[^\s@]+@[^\s@]+$/.test(value.trim())?value.trim():'')).trim(),name=(match?.[1]||value.replace(/<[^>]+>/g,'')).replace(/^['"]|['"]$/g,'').trim();return{name:name||email||fallback,email:name&&email?email:''}},escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),Highlight=({value,terms}:{value:string;terms:string[]})=>{const clean=[...new Set(terms.map(item=>item.trim()).filter(Boolean))].sort((a,b)=>b.length-a.length);if(!clean.length||!value)return value;const pattern=new RegExp(`(${clean.map(escape).join('|')})`,'gi'),exact=new Set(clean.map(item=>item.toLocaleLowerCase())),parts=value.split(pattern);return <>{parts.map((part,index)=>exact.has(part.toLocaleLowerCase())?<mark className='mail-search-hit' key={`${index}:${part}`}>{part}</mark>:<span key={`${index}:${part}`}>{part}</span>)}</>},styleClass=(value?:MailTextStyle)=>value?.spoiler?'mail-density-text mail-density-spoiler':'mail-density-text',styleCss=(value:MailTextStyle|undefined,weight:number):CSSProperties=>({...({'--mail-density-field-weight':weight}as CSSProperties),fontWeight:weight,fontStyle:value?.italic?'italic':undefined,textDecorationLine:([value?.underline?'underline':'',value?.strike?'line-through':''].filter(Boolean).join(' ')||undefined)as CSSProperties['textDecorationLine'],fontFamily:value?.mono?'ui-monospace,SFMono-Regular,Consolas,monospace':undefined,borderInlineStart:value?.quote?'2px solid currentColor':undefined,paddingInlineStart:value?.quote?'.35em':undefined}),  dateView = (
    mode: MailDateMode,
    date: string,
    time: string,
    fallback: string,
    auto: { primary: string; alternate: string },
  ) =>
    mode === "hidden"
      ? { primary: "", alternate: "" }
      : mode === "auto"
        ? { primary: auto.primary || fallback, alternate: auto.alternate }
        : mode === "date"
          ? { primary: date || fallback, alternate: "" }
          : mode === "time"
            ? { primary: time || fallback, alternate: "" }
            : mode === "date-time"
              ? {
                  primary: date && time ? `${date} · ${time}` : fallback,
                  alternate: "",
                }
              : mode === "date-hover-time"
                ? { primary: date || fallback, alternate: time }
                : { primary: time || fallback, alternate: date },
  // Ukrainian plural form picker: 1 → one, 2-4 → few, 0/5+ → many
  // (with the standard 11-14 exception, which matters for e.g. "14 днів").
  pluralUk = (n: number, one: string, few: string, many: string) => {
    const mod10 = n % 10,
      mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14))
      return few;
    return many;
  },
  smartDate = (
    stamp: Date | null,
    lang: "uk" | "nl",
  ): { primary: string; alternate: string } => {
    if (!stamp) return { primary: "", alternate: "" };
    const locale = lang === "uk" ? "uk-UA" : "nl-BE",
      now = new Date(),
      startOfDay = (value: Date) =>
        new Date(value.getFullYear(), value.getMonth(), value.getDate()),
      dayDiff = Math.round(
        (startOfDay(now).getTime() - startOfDay(stamp).getTime()) / 86400000,
      ),
      time = stamp.toLocaleTimeString(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
      sameYear = stamp.getFullYear() === now.getFullYear(),
      weekdayLong = new Intl.DateTimeFormat(locale, {
        weekday: "long",
      }).format(stamp),
      dayMonth = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
      }).format(stamp),
      // Точний варіант — завжди показується при наведенні/фокусі, незалежно
      // від того, яка коротка (відносна) мітка видна за замовчуванням.
      alternate = `${weekdayLong}, ${dayMonth}${sameYear ? "" : " " + stamp.getFullYear()} · ${time}`;
    if (dayDiff <= 0) {
      const minutesAgo = Math.floor((now.getTime() - stamp.getTime()) / 60000),
        hoursAgo = Math.floor(minutesAgo / 60);
      if (minutesAgo < 15)
        return { primary: lang === "uk" ? "Щойно" : "Zojuist", alternate };
      if (hoursAgo < 1) return { primary: time, alternate };
      return {
        primary:
          lang === "uk"
            ? `${hoursAgo} ${pluralUk(hoursAgo, "годину", "години", "годин")} тому`
            : `${hoursAgo} uur geleden`,
        alternate,
      };
    }
    // Лист впав саме на минулі суботу/неділю (і вже не «вчора»/«позавчора») —
    // «тими вихідними» зрозуміліше за суху лічбу днів.
    const weekday = stamp.getDay(),
      wasWeekend = weekday === 0 || weekday === 6;
    if (dayDiff === 1)
      return { primary: lang === "uk" ? "Вчора" : "Gisteren", alternate };
    if (dayDiff === 2)
      return { primary: lang === "uk" ? "Позавчора" : "Eergisteren", alternate };
    if (wasWeekend && dayDiff >= 3 && dayDiff <= 9)
      return {
        primary: lang === "uk" ? "Тими вихідними" : "Afgelopen weekend",
        alternate,
      };
    if (dayDiff <= 5)
      return {
        primary:
          lang === "uk"
            ? `${dayDiff} ${pluralUk(dayDiff, "день", "дні", "днів")} тому`
            : `${dayDiff} dagen geleden`,
        alternate,
      };
    if (dayDiff <= 13)
      return { primary: alternate, alternate: lang === "uk" ? "Тиждень тому" : "Een week geleden" };
    if (dayDiff <= 20)
      return {
        primary: alternate,
        alternate: lang === "uk" ? "Два тижні тому" : "Twee weken geleden",
      };
    if (dayDiff <= 45)
      return { primary: alternate, alternate: lang === "uk" ? "Місяць тому" : "Een maand geleden" };
    if (dayDiff <= 330)
      return {
        primary: alternate,
        alternate: `${dayMonth}${sameYear ? "" : " " + stamp.getFullYear()}`,
      };
    const years = Math.max(1, Math.round(dayDiff / 365.25));
    return {
      primary: alternate,
      alternate:
        lang === "uk"
          ? years === 1
            ? "Рік тому"
            : `${years} ${pluralUk(years, "рік", "роки", "років")} тому`
          : years === 1
            ? "Jaar geleden"
            : `${years} jaar geleden`,
    };
  };export default function MailMessageRow({lang,message,attachments,density,profile,selected,busy,loadingKey,attachmentCacheScope,attachmentCacheVersion,dateText,unknownSender,noSubject,selectLabel,accountLabel='',lastViewed=false,selectable=true,actionsEnabled=true,rowTone='',starColor='#f59e0b',labelNames=[],important=false,minimumPreviewActive=false,onMinimumPreviewChange,snoozedUntil=0,providerSnoozed=false,providerSnoozeObservedAt=0,unsubscribeAvailable=false,classificationKind='people',classificationManual='',classificationReason='',classificationSender='',highlightTerms=[],quickActions,attentionKind='ordinary',senderColor='',senderAvatar='',senderColorBusy=false,skeleton=false,onSenderColor,onOpen,onToggle,onEnterSelection,onStar,onPrefetch,onAttachment,onAttachmentHoverPreview,onAction,onSnooze,onCancelSnooze,onUnsubscribe,onPromoteMessage,onPromoteSender,onClassifySender,onAttention}:Props){const hold=useRef<number|undefined>(undefined),clearHold=()=>{if(hold.current!==undefined){window.clearTimeout(hold.current);hold.current=undefined}},subjectHoverTimer=useRef<number|undefined>(undefined),[subjectTooltip,setSubjectTooltip]=useState(false),subjectTextRef=useRef<HTMLElement|null>(null),subjectTooltipRef=useRef<HTMLSpanElement|null>(null),beginSubjectHover=()=>{const el=subjectTextRef.current;if(!el||el.scrollWidth<=el.clientWidth+1)return;if(subjectHoverTimer.current!==undefined)window.clearTimeout(subjectHoverTimer.current);subjectHoverTimer.current=window.setTimeout(()=>{subjectHoverTimer.current=undefined;setSubjectTooltip(true)},3000)},endSubjectHover=()=>{if(subjectHoverTimer.current!==undefined){window.clearTimeout(subjectHoverTimer.current);subjectHoverTimer.current=undefined}setSubjectTooltip(false)},moveSubjectHover=(event:{currentTarget:HTMLElement;clientX:number})=>{const el=subjectTooltipRef.current;if(!el)return;const rect=event.currentTarget.getBoundingClientRect(),ratio=rect.width?Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)):0,max=el.scrollWidth-el.clientWidth;if(max>0)el.scrollLeft=ratio*max},senderHoverTimer=useRef<number|undefined>(undefined),[senderTooltip,setSenderTooltip]=useState(false),senderTextRef=useRef<HTMLElement|null>(null),senderTooltipRef=useRef<HTMLSpanElement|null>(null),beginSenderHover=()=>{const el=senderTextRef.current;if(!el||el.scrollWidth<=el.clientWidth+1)return;if(senderHoverTimer.current!==undefined)window.clearTimeout(senderHoverTimer.current);senderHoverTimer.current=window.setTimeout(()=>{senderHoverTimer.current=undefined;setSenderTooltip(true)},3000)},endSenderHover=()=>{if(senderHoverTimer.current!==undefined){window.clearTimeout(senderHoverTimer.current);senderHoverTimer.current=undefined}setSenderTooltip(false)},moveSenderHover=(event:{currentTarget:HTMLElement;clientX:number})=>{const el=senderTooltipRef.current;if(!el)return;const rect=event.currentTarget.getBoundingClientRect(),ratio=rect.width?Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width)):0,max=el.scrollWidth-el.clientWidth;if(max>0)el.scrollLeft=ratio*max},t=(uk:string,nl:string)=>lang==='uk'?uk:nl,who=sender(message.from,unknownSender),initials=(who.name||who.email||'?').split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()||'').join('')||'?',activeSnooze=snoozedUntil>Date.now(),snoozeSource=activeSnooze&&providerSnoozed?'local+gmail_search':activeSnooze?'local':providerSnoozed?'gmail_search':'none',stamp=Number.isFinite(message.receivedAt)&&message.receivedAt>0?new Date(message.receivedAt):null,locale=lang==='uk'?'uk-UA':'nl-BE',dateOnly=stamp?.toLocaleDateString(locale,{day:'2-digit',month:'2-digit',year:'2-digit'})||'',timeOnly=stamp?.toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})||'',dateState=dateView(profile.dateMode,dateOnly,timeOnly,dateText,smartDate(stamp,lang)),dateHover=Boolean(dateState.alternate),compactFixed=density==='detailed'&&profile.blockOrder.join('|')==='avatar|sender|subject|snippet|attachments|date'&&profile.senderLayout==='inline'&&profile.subjectSnippetLayout==='inline',nameWeight=density==='detailed'?(profile.senderNameWeight===400?(message.unread?700:400):profile.senderNameWeight):message.unread?Math.max(700,profile.senderNameWeight):profile.senderNameWeight,subjectWeight=density==='detailed'?(profile.subjectWeight===400?(message.unread?700:400):profile.subjectWeight):message.unread?Math.max(700,profile.subjectWeight):profile.subjectWeight,dateWeight=density==='detailed'?(profile.dateWeight===400?(message.unread?700:400):profile.dateWeight):profile.dateWeight,subjectIndex=profile.blockOrder.indexOf('subject'),snippetIndex=profile.blockOrder.indexOf('snippet'),copyAdjacent=Math.abs(subjectIndex-snippetIndex)===1,copySecond=subjectIndex>snippetIndex?'subject':'snippet';if(density==='minimum'||compactFixed)return <MailMinimumMessageRow density={density==='detailed'?'detailed':'minimum'} lang={lang} message={message} attachments={attachments} profile={profile} selected={selected} selectable={selectable} busy={busy} loadingKey={loadingKey} attachmentCacheScope={attachmentCacheScope} attachmentCacheVersion={attachmentCacheVersion} dateText={dateText} unknownSender={unknownSender} noSubject={noSubject} selectLabel={selectLabel} accountLabel={accountLabel} lastViewed={lastViewed} actionsEnabled={actionsEnabled} rowTone={rowTone} starColor={starColor} snoozedUntil={snoozedUntil} providerSnoozed={providerSnoozed} providerSnoozeObservedAt={providerSnoozeObservedAt} unsubscribeAvailable={unsubscribeAvailable} classificationKind={classificationKind} classificationManual={classificationManual} classificationReason={classificationReason} classificationSender={classificationSender} highlightTerms={highlightTerms} quickActions={quickActions} attentionKind={attentionKind} senderColor={senderColor} senderAvatar={senderAvatar} senderColorBusy={senderColorBusy} labelNames={labelNames} important={important} previewActive={minimumPreviewActive} skeleton={skeleton} onSenderColor={onSenderColor} onOpen={onOpen} onToggle={onToggle} onEnterSelection={onEnterSelection} onStar={onStar} onPrefetch={onPrefetch} onAttachment={onAttachment} onAttachmentHoverPreview={onAttachmentHoverPreview} onAction={onAction} onSnooze={onSnooze} onCancelSnooze={onCancelSnooze} onUnsubscribe={onUnsubscribe} onPromoteMessage={onPromoteMessage} onPromoteSender={onPromoteSender} onClassifySender={onClassifySender} onAttention={onAttention} onPreviewChange={onMinimumPreviewChange}/>;const rowActionsRef=useRef<HTMLElement|null>(null),snippetMeasureRef=useRef<HTMLElement|null>(null);useLayoutEffect(()=>{const row=rowActionsRef.current,line=snippetMeasureRef.current;if(!row||!line)return;const measure=()=>{const rowRect=row.getBoundingClientRect(),lineRect=line.getBoundingClientRect();if(!rowRect.height||!lineRect.height)return;row.style.setProperty('--mail-row-actions-y',`${Math.round(lineRect.top-rowRect.top+lineRect.height/2)}px`)};measure();const observer=new ResizeObserver(measure);observer.observe(row);observer.observe(line);return()=>observer.disconnect()},[profile.showSnippet,profile.showAttachments,attachments.length,density,profile.blockOrder.join('|')]);return <article ref={rowActionsRef} className={`google-mail-row mail-row-semantic-order ${message.unread?'unread':'read'} ${selected?'selected':''} ${selected?'selection-mode':''} ${lastViewed?'last-viewed':''} ${activeSnooze?'snoozed':''} ${providerSnoozed?'provider-snoozed':''} ${classificationKind==='system'&&!classificationManual?'has-classification':''}${skeleton?' mail-row-skeleton':''}`} data-mail-loading-row={skeleton?'semantic':undefined} inert={skeleton||undefined} aria-hidden={skeleton||undefined} data-read-state={message.unread?'unread':'read'} data-date-mode={profile.dateMode} data-mail-snooze-source={snoozeSource} data-mail-snooze-observed-at={providerSnoozed?providerSnoozeObservedAt:0} data-mail-custom-tone={rowTone?'true':'false'} style={rowTone?({'--mail-row-custom':rowTone}as CSSProperties):undefined} data-mail-message-id={message.id} data-mail-account-id={message.sourceAccountId||''} onPointerDown={event=>{if(!onEnterSelection||selectable||event.pointerType==='mouse')return;const target=event.target as Element;if(target.closest('.mail-row-interactive,.mail-row-hover-actions'))return;hold.current=window.setTimeout(()=>{hold.current=undefined;onEnterSelection()},450)}} onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold} onPointerEnter={()=>onPrefetch('intent')} onFocusCapture={()=>onPrefetch('intent')}><button type='button' className='google-mail-open mail-row-open-hit' aria-label={t(`Відкрити лист: ${message.subject||noSubject}`,`Bericht openen: ${message.subject||noSubject}`)} onClick={onOpen}/><div className='mail-row-block-stream' data-copy-layout={profile.subjectSnippetLayout} data-many-attachments={attachments.length>=3?"true":undefined}><MailOrderedDensityBlocks order={profile.blockOrder}>{profile.showAvatar&&<span className='mail-row-block mail-row-avatar-block mail-row-interactive' data-mail-density-block='avatar'><span className={`mail-row-avatar${selectable&&selected?' selected':''}`} role='checkbox' tabIndex={0} aria-checked={selected} aria-label={selectLabel} onClick={event=>{event.preventDefault();event.stopPropagation();if(!selectable)onEnterSelection?.();else onToggle()}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();if(!selectable)onEnterSelection?.();else onToggle()}}}>{selectable&&selected?<Check/>:<StableAvatar src={senderAvatar} fallback={initials} alt=''/>}</span></span>}{(profile.showSenderName||profile.showSenderEmail||accountLabel)&&<span className='mail-row-block mail-row-sender-block mail-row-interactive' data-mail-density-block='sender' onPointerEnter={beginSenderHover} onPointerMove={moveSenderHover} onPointerLeave={endSenderHover}><span className='mail-row-sender-copy' data-layout={profile.senderLayout}>{profile.showSenderName&&<strong ref={senderTextRef} className={styleClass(profile.senderNameStyle)} style={styleCss(profile.senderNameStyle,nameWeight)}><Highlight value={who.name} terms={highlightTerms}/></strong>}{profile.senderLayout==='inline'&&profile.showSenderName&&profile.showSenderEmail&&who.email&&<span className='mail-row-inline-separator' aria-hidden='true'>·</span>}{profile.showSenderEmail&&who.email&&<small className='mail-density-text' style={styleCss(undefined,profile.senderEmailWeight)}><Highlight value={who.email} terms={highlightTerms}/></small>}{accountLabel&&<em className='mail-row-account'>{accountLabel}</em>}</span>{senderTooltip&&who.email&&<span ref={senderTooltipRef} className='mail-row-sender-tooltip' role='tooltip'>{who.email}</span>}</span>}{profile.showSubject&&<span className={`mail-row-block mail-row-subject-block mail-row-interactive${copyAdjacent&&profile.subjectSnippetLayout==='stacked'&&copySecond==='subject'?' stack-start':''}`} data-mail-density-block='subject' onPointerEnter={beginSubjectHover} onPointerMove={moveSubjectHover} onPointerLeave={endSubjectHover}><strong ref={subjectTextRef} className={styleClass(profile.subjectStyle)} style={styleCss(profile.subjectStyle,subjectWeight)}><Highlight value={message.subject||noSubject} terms={highlightTerms}/></strong>{subjectTooltip&&(message.subject||noSubject)&&<span ref={subjectTooltipRef} className='mail-row-subject-tooltip' role='tooltip'>{message.subject||noSubject}</span>}</span>}{profile.showSnippet&&<span ref={snippetMeasureRef} className={`mail-row-block mail-row-snippet-block${copyAdjacent&&profile.subjectSnippetLayout==='stacked'&&copySecond==='snippet'?' stack-start':''}`} data-mail-density-block='snippet'><small className={styleClass(profile.snippetStyle)} style={styleCss(profile.snippetStyle,profile.snippetWeight)}><Highlight value={message.snippet} terms={highlightTerms}/></small></span>}{(dateState.primary||message.relevancePercent!==undefined)&&<div className='mail-row-block mail-row-right-meta mail-row-date-block mail-row-interactive' data-mail-density-block='date' data-mail-date-preserved='true'>{message.relevancePercent!==undefined&&<span className='mail-search-relevance-score' data-mail-search-relevance={Math.round(message.relevancePercent)} title={t(`Релевантність пошуку: ${Math.round(message.relevancePercent)}%`,`Zoekrelevantie: ${Math.round(message.relevancePercent)}%`)}>{Math.round(message.relevancePercent)}%</span>}{rowTone&&message.unread&&<span className='mail-row-tone-dot' aria-hidden='true'/>}{dateState.primary&&<time className={`${styleClass(profile.dateStyle)} mail-row-date-mode`} data-mail-original-date='true' data-date-mode={profile.dateMode} tabIndex={dateHover?0:undefined} aria-label={dateHover?`${dateState.primary}; ${t('при наведенні або фокусі','bij aanwijzen of focus')}: ${dateState.alternate}`:dateState.primary} style={styleCss(profile.dateStyle,dateWeight)} onClick={onOpen} onKeyDown={event=>{if((event.key==='Enter'||event.key===' ')&&dateHover){event.preventDefault();onOpen()}}}><span>{dateState.primary}</span>{dateState.alternate&&<span>{dateState.alternate}</span>}</time>}</div>}{profile.showAttachments&&attachments.length>0&&(profile.attachmentPresentation==='indicator'?<span className='mail-row-block mail-row-attachments-block mail-row-attachment-indicator' data-mail-density-block='attachments' role='img' aria-label={t(`Вкладень: ${attachments.length}`,`Bijlagen: ${attachments.length}`)} title={t(`Вкладень: ${attachments.length}`,`Bijlagen: ${attachments.length}`)}><Paperclip aria-hidden='true'/></span>:<div className='mail-row-block mail-row-attachments-block mail-row-interactive' data-mail-density-block='attachments'><Suspense fallback={null}><MailAttachmentStrip items={attachments} density={density} presentation={profile.attachmentPresentation} showName={profile.showAttachmentName} showSize={profile.showAttachmentSize} showTypeIcon={profile.showAttachmentTypeIcon} typeIconPosition={profile.attachmentTypeIconPosition} messageId={message.id} loadingKey={loadingKey} cacheScope={attachmentCacheScope} cacheVersion={attachmentCacheVersion} allowCachedPreview={density==='normal'} hoverPreview={density!=='normal'} hoverPreviewLang={lang} onHoverPreviewLoad={onAttachmentHoverPreview} onOpen={onAttachment}/></Suspense></div>)}</MailOrderedDensityBlocks></div>{actionsEnabled&&<MailRowQuickActions lang={lang} busy={busy} profile={quickActions} unread={message.unread} classificationKind={classificationKind} classificationManual={classificationManual} classificationReason={classificationReason} classificationSender={classificationSender} unsubscribeAvailable={unsubscribeAvailable} snoozedUntil={activeSnooze?snoozedUntil:0} providerSnoozed={providerSnoozed} attentionKind={attentionKind} senderColor={senderColor} senderColorBusy={senderColorBusy} onSenderColor={onSenderColor} onAction={onAction} onSelect={onEnterSelection} onStar={onStar} starred={message.starred} onClassifySender={kind=>onClassifySender?.(kind)} onPromoteMessage={()=>onPromoteMessage?.()} onPromoteSender={()=>onPromoteSender?.()} onSnooze={onSnooze} onCancelSnooze={onCancelSnooze} onUnsubscribe={onUnsubscribe} onAttention={kind=>onAttention?.(kind)}/>}</article>}