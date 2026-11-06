import { api } from './platform/client';
import { Brain, Check, ChevronRight, Cloud, File, FileText, FolderKanban, Inbox, Link2, LoaderCircle, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Unplug, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import DriveBrowser,{CloudFileWorkbench,loadCloudFilePreview,type CloudRawFile} from './DriveBrowser';import{revokeMailAttachmentPreview,type MailAttachmentPreview}from'./MailBijlageVoorbeeld';
import {GoogleCalendarView,GooglePhotosView} from './GoogleSuiteMediaWeergave';
import GlobalSearchPanel from './GlobaalZoekPaneel';
import { zoekPaginaUrl } from './zoek/ZoekGlobaal'; // Z4 22.10.2026: de kapotte SearchPage (403 zonder service) is weg; knop → hub /zoek?bron=cloud
import{emitCanonicalNotice}from'./canoniek-meldingen';
import './cloud-functioneel.css';
import {lazy,Suspense} from 'react';
const CloudM10Verkenner=lazy(()=>import('./cloud/CloudM10Verkenner'));
const CloudVerbindingCentrumM4=lazy(()=>import('./cloud/CloudVerbindingCentrum').then(m=>({default:m.CloudVerbindingCentrum})));
const CloudAanbiedersM5=lazy(()=>import('./cloud/CloudAanbiedersM5').then(m=>({default:m.CloudAanbiedersM5})));
const CLOUD_M10_STAGE = (import.meta as ImportMeta & { env?: Record<string,string> }).env?.VITE_CLOUD_FULL_STAGING === 'enabled';

// 21.10.2026: schema's (.mmd) van het hulpmiddel diagram_generate tekenen met de eigen gebundelde Mermaid (src/media/MermaidSchema.tsx).
import MermaidSchema from './media/MermaidSchema';
import { isMermaidBestand } from '../shared/mermaid-schema';
import { RuimteGeslotenVlak } from './RuimteStrook';
import { ruimteGeslotenUit } from '../shared/ruimte-weergave';
import { isLeesfout, leesBase64 } from '../shared/bestand-lezen';
import { bestandLeesUitleg, bestandLeesfoutCode } from '../shared/foutuitleg';

type Lang = 'uk' | 'nl';
type Energy = 'low' | 'medium' | 'high';
type Workspace = { id: string; title: string; description: string; template: 'project' | 'documentation' | 'meeting' | 'personal'; sections: Array<{ id: string; labelUk: string; labelNl: string }>; itemCount: number; createdAt: number; updatedAt: number };
type CloudItem = { id: string; workspaceId: string; suggestedWorkspaceId: string; kind: 'file' | 'note' | 'link'; title: string; originalName: string; description: string; sourceUrl: string; mimeType: string; sizeBytes: number; tags: string[]; people: string[]; status: 'captured' | 'waiting_review' | 'in_progress' | 'done'; aiState: 'suggested' | 'fallback'; aiConfidence: number; createdAt: number; updatedAt: number; openedAt: number; excerpt: string; downloadable: boolean };
type Resume = { currentWorkspaceId: string; currentItemId: string; focus: boolean; energy: Energy; updatedAt: number };
type ProviderAccount = { id: string; principalId: string; accountRole: 'primary' | 'additional'; email: string; displayName: string; picture: string; status: string; grantedScopes: string[]; connectionStage: string; lastErrorCode: string; storageLimit: string; storageUsage: string; storageUsageInDrive: string; tokenName: string; updatedAt: number };
type Provider = { id: string; name: string; status: string; connectEnabled: boolean; scopeMode: string; scope: string; scopeClassification: string; serviceTokenName: string; accountModel: string; automaticUseAfterConsent: boolean; silentNewScopeGrant: boolean; missing: string[]; reasonCode: string; account: ProviderAccount | null; primaryAccount: ProviderAccount | null; accounts: ProviderAccount[]; activeAccountId: string; destructivePolicy: { automaticDelete: boolean; automaticOverwrite: boolean; explicitConfirmationRequired: boolean } };
type SuiteService = { id: 'mail' | 'drive' | 'calendar' | 'photos'; order: number; title: string; status: 'granted' | 'configuration_missing' | 'consent_required' | 'waiting_previous_consent'; granted: boolean; priorComplete: boolean; connectEnabled: boolean; tokenName: string; oauthClientName: string; scopes: string[]; scopeClassification: string; runtimeBinding: string; missing: string[]; automaticUseAfterConsent: boolean; accessTokensPersisted: boolean; refreshMode: string };
type DrivePreviewFile = { id: string; name: string; mimeType: string; modifiedAt: number; webViewLink: string; parentIds: string[]; size: string };
type SuiteOnboarding = { architecture: string; primaryAccount: { email: string; principalId: string; identityLinked: boolean }; services: SuiteService[]; nextService: SuiteService['id'] | ''; completedServices: SuiteService['id'][]; completedCount: number; totalServices: number; complete: boolean; tokenPolicy: { canonicalGrantTable: string; singleRefreshTokenPerPrincipal: boolean; refreshTokenCopies: number; serviceHandles: boolean; scopeGuard: string; accessTokensPersisted: boolean; refreshMode: string; clientRef: string; tokenNames: string[]; grantedScopes: string[] }; additionalAccounts: { mode: string; includedInPrimarySequence: boolean }; runtimeBoundaries: Record<string, string> };
/**
 * GESCHEIDEN GEGEVENSRUIMTES (backend/ruimte-cloud-agenda.ts): in welke lade kijkt deze mens.
 *  ok: true  -> `ruimte` zegt persoonlijk of technisch, `gedeeld` of de technische ruimte bewust de PERSOONLIJKE
 *               bestanden gebruikt; `uitleg` staat in beide talen klaar voor het scherm;
 *  ok: false -> de hmara staat hier uit, is bevroren, of er is nog niets gekozen. Het overzicht komt dan met status
 *               200 terug MET deze uitleg (ZACHTE_ROUTES), zodat de pagina de reden toont in plaats van «0 bestanden».
 */
type CloudRuimte =
  | { ok: true; ruimte: 'prive' | 'technisch'; stand: string; gedeeld: boolean; dienst: string; naam: { uk: string; nl: string }; uitleg: { uk: string; nl: string } }
  | { ok: false; dienst: string; dienstNaam?: { uk: string; nl: string }; code: string; uitleg: { uk: string; nl: string } };
type Bootstrap = { architecture: string; ruimte?: CloudRuimte; workspaces: Workspace[]; items: CloudItem[]; inbox: CloudItem[]; recent: CloudItem[]; resume: Resume | null; summary: { workspaces: number; inbox: number; active: number; done: number }; providers: Provider[]; onboarding: SuiteOnboarding; capabilities: Record<string, string> }; 
type Props = { lang: Lang; tab: string; userEmail: string; sourceOrigin: string; tabContext: string; onFocusChange: (active: boolean) => void; onNavigateTab: (tab: string) => void };

const EMPTY_ONBOARDING: SuiteOnboarding = { architecture: 'primary_google_suite_onboarding_bplus_v1', primaryAccount: { email: '', principalId: '', identityLinked: false }, services: [], nextService: '', completedServices: [], completedCount: 0, totalServices: 4, complete: false, tokenPolicy: { canonicalGrantTable: 'google_oauth_grant_v1', singleRefreshTokenPerPrincipal: true, refreshTokenCopies: 0, serviceHandles: true, scopeGuard: 'requiredScopes_subset_of_grantedScopes', accessTokensPersisted: false, refreshMode: 'on_demand_from_canonical_grant', clientRef: 'google_suite_web_oauth_client', tokenNames: [], grantedScopes: [] }, additionalAccounts: { mode: 'explicit_optional_isolated_per_principal_grant', includedInPrimarySequence: false }, runtimeBoundaries: {} };
const EMPTY: Bootstrap = { architecture: 'workspace-functional-v1', workspaces: [], items: [], inbox: [], recent: [], resume: null, summary: { workspaces: 0, inbox: 0, active: 0, done: 0 }, providers: [], onboarding: EMPTY_ONBOARDING, capabilities: {} };
/**
 * KLACHT 3 VAN DE EIGENAAR (20.10.2026): «https://cloud.tarasevych.com/ при технічному немає робочої — навіть меню пропало.»
 *
 * Wat er gebeurde, en waarom het meer dan een leeg scherm was: staat de hmara in de technische ruimte uit (of bevroren, of
 * is de eenmalige keuze nog niet gemaakt), dan geeft /api/owner/cloud/bootstrap status 200 met de UITLEG erin en een leeg
 * lichaam (ZACHTE_ROUTES in backend/ruimte-cloud-agenda.ts). In dat lichaam stonden `providers: null` en `onboarding: null`,
 * en hieronder werd meteen `data.onboarding.services` en `data.providers.find(...)` gelezen. Dat is een TypeError TIJDENS
 * HET RENDEREN; React gooit dan de HELE boom weg, dus ook CanonicalChrome — en daarmee de zijbalk, de shapka en de tabbladen.
 * Vandaar «навіть меню пропало».
 *
 * Twee sloten, want één is er één te weinig: de server geeft nu een lichaam met dezelfde VORM (alleen leeg), en hier wordt
 * ELK antwoord genormaliseerd voordat het in de staat komt. Een oude server, een afgekapt antwoord of een veld dat morgen
 * verdwijnt kan de pagina daarna niet meer slopen; zij blijft een pagina met menu en zegt in de werkruimte waarom er niets
 * staat. Pure functie, zodat de eenheidstest haar los kan nameten.
 */
export const normaliseerBootstrap = (ruw: unknown): Bootstrap => {
  const o = (ruw && typeof ruw === 'object' ? ruw as Record<string, unknown> : {});
  const lijst = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);
  const ob = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
  const sum = ob(o.summary);
  const onb = ob(o.onboarding);
  return {
    ...EMPTY, ...o,
    architecture: String(o.architecture || EMPTY.architecture),
    workspaces: lijst<Workspace>(o.workspaces), items: lijst<CloudItem>(o.items), inbox: lijst<CloudItem>(o.inbox), recent: lijst<CloudItem>(o.recent),
    resume: (o.resume && typeof o.resume === 'object' ? o.resume as Resume : null),
    summary: {
      workspaces: Number(sum.workspaces) || 0, inbox: Number(sum.inbox) || 0,
      active: Number(sum.active) || 0, done: Number(sum.done) || 0,
    },
    providers: lijst<Provider>(o.providers),
    onboarding: { ...EMPTY_ONBOARDING, ...onb, services: lijst<SuiteService>(onb.services), completedServices: lijst<SuiteService['id']>(onb.completedServices) },
    capabilities: ob(o.capabilities) as Record<string, string>,
    ruimte: (o.ruimte && typeof o.ruimte === 'object' ? o.ruimte as CloudRuimte : undefined),
  };
};
const statusOrder: CloudItem['status'][] = ['captured', 'waiting_review', 'in_progress', 'done'];
// Lezen van de schijf gaat door shared/bestand-lezen.ts: een DOMException van de File API (NotReadableError…) kwam hier als
// kale code «read» bij de gebruiker terecht. Eigenaar 20.10.2026.
const fileBase64 = (file: File) => leesBase64(file);
const errorCode = (caught: unknown) => String((caught as { response?: { data?: { error?: string } } })?.response?.data?.error || (caught as Error)?.message || 'UNKNOWN');
const suiteServiceId = (value: string | null): SuiteService['id'] | '' => value && ['mail', 'drive', 'calendar', 'photos'].includes(value) ? value as SuiteService['id'] : '';

export default function CloudFunctionalView({ lang, tab, userEmail, sourceOrigin, tabContext, onFocusChange, onNavigateTab }: Props) {
  const t = (uk: string, nl: string) => lang === 'uk' ? uk : nl;
  const notify=(text:string,kind:'info'|'success'|'warning'|'error'='info')=>emitCanonicalNotice({text,kind,source:'cloud'});
  const effectiveTab = ['google', 'onedrive', 'dropbox'].includes(tab) ? 'accounts' : tab;
  const [data, setData] = useState<Bootstrap>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('');
  const [focus, setFocus] = useState(false);
  const [energy, setEnergy] = useState<Energy>('medium');
  const [createOpen, setCreateOpen] = useState(false);
  const [workspaceTitle, setWorkspaceTitle] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [workspaceTemplate, setWorkspaceTemplate] = useState<Workspace['template']>('project');
  const [captureKind, setCaptureKind] = useState<CloudItem['kind']>('note');
  const [captureText, setCaptureText] = useState('');
  const [captureUrl, setCaptureUrl] = useState('');
  const [captureWorkspaceId, setCaptureWorkspaceId] = useState('');
  const [captureFile, setCaptureFile] = useState<File | null>(null);
  const initialGlobalQuery = (() => { try { return new URL(location.href).searchParams.get('global_search') || ''; } catch { return ''; } })();
  const [searchQuery, setSearchQuery] = useState(initialGlobalQuery);
  const [searchWorkspaceId, setSearchWorkspaceId] = useState('');
  const [searchResults, setSearchResults] = useState<CloudItem[]>([]);
  const [drivePreview, setDrivePreview] = useState<DrivePreviewFile[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [openedNote, setOpenedNote] = useState<{ title: string; text: string } | null>(null);const[openedFile,setOpenedFile]=useState<MailAttachmentPreview|null>(null);const [openedSchema, setOpenedSchema] = useState<{ title: string; code: string } | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const globalSearchConsumed = useRef(false);
  const firstLoad = useRef(true);
  const resumeFingerprint = useRef('');
  const post = <T,>(path: string, payload: Record<string, unknown> = {}) => api.post(path, { service: 'cloud', tabContext, sourceOrigin, ...payload }) as Promise<{ data: T }>;
  const activeWorkspace = data.workspaces.find(item => item.id === activeWorkspaceId) || null;
  const workspaceItems = useMemo(() => activeWorkspaceId ? data.items.filter(item => item.workspaceId === activeWorkspaceId) : [], [data.items, activeWorkspaceId]);

  /** De weigering van de poort in de vorm die het hele huis al kent (shared/ruimte-weergave.ts), zodat hmara, dosjka en
   *  GitHub precies dezelfde uitleg en dezelfde knop tonen. `null` = de lade is open. */
  const gesloten = useMemo(() => (data.ruimte && data.ruimte.ok === false
    ? ruimteGeslotenUit({ error: data.ruimte.code, dienst: data.ruimte.dienst || 'cloud', dienstNaam: data.ruimte.dienstNaam, uitleg: data.ruimte.uitleg })
    : null), [data.ruimte]);
  // Twee regels die de pagina ooit sloopten (klacht 3): `?.` hoort hier ook te staan, ook nu het lichaam genormaliseerd wordt.
  const suiteDrive = data.onboarding?.services?.find(service => service.id === 'drive');
  const googleProvider = data.providers?.find(provider => provider.id === 'google');
  const drivePrimary = googleProvider?.primaryAccount || googleProvider?.accounts.find(account => account.accountRole === 'primary') || null;
  const driveAccess = Boolean(suiteDrive?.granted || drivePrimary?.status === 'connected');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await post<Bootstrap>('/api/owner/cloud/bootstrap');
      const veilig = normaliseerBootstrap(response.data);
      setData(veilig);
      if (firstLoad.current) {
        const resumedFocus = Boolean(veilig.resume?.focus && veilig.resume?.currentWorkspaceId && effectiveTab === 'workspaces');
        setEnergy(veilig.resume?.energy || 'medium');
        setActiveWorkspaceId(veilig.resume?.currentWorkspaceId || '');
        setFocus(resumedFocus);
        onFocusChange(resumedFocus);
        firstLoad.current = false;
      }
    } catch (caught) {
      notify(t('Не вдалося відкрити Cloud. Дані не змінено.', 'Cloud kon niet worden geopend. Er zijn geen gegevens gewijzigd.'),'error');
    }
    setLoading(false);
  };

  const loadDrivePreview = async () => { setPreviewLoading(true); try { const response = await post<{ files: DrivePreviewFile[] }>('/api/owner/cloud/google-suite/drive/preview'); setDrivePreview(response.data.files || []); } catch { setDrivePreview([]); notify(t('Доступ збережено, але список файлів зараз не завантажився. Спробуйте ще раз.', 'De toegang is opgeslagen, maar de bestandslijst kon nu niet worden geladen. Probeer het opnieuw.'),'warning'); } setPreviewLoading(false); };
  useEffect(() => { const current = new URL(location.href), connected = suiteServiceId(current.searchParams.get('google_suite_connected')), callbackSuccess = current.searchParams.get('google_suite_callback') === 'success'; if (callbackSuccess && connected) { current.searchParams.delete('google_suite_connected'); current.searchParams.delete('google_suite_callback'); history.replaceState({}, '', `${current.pathname}${current.search}${current.hash}`); notify(connected === 'drive' ? t('Google Drive підключено. Можна переглянути останні файли без запуску повної синхронізації.', 'Google Drive is gekoppeld. U kunt recente bestanden bekijken zonder volledige synchronisatie te starten.') : t('Доступ до сервісу надано.', 'Toegang tot de dienst is verleend.'),'success'); if (connected === 'drive') void loadDrivePreview(); } void load(); return () => onFocusChange(false); }, []);
  useEffect(() => { if ((effectiveTab === 'overview' || effectiveTab === 'accounts') && driveAccess && drivePreview === null && !previewLoading) void loadDrivePreview(); }, [effectiveTab, driveAccess, drivePreview, previewLoading]);
  useEffect(() => { if (!activeWorkspaceId && focus) { setFocus(false); onFocusChange(false); } }, [activeWorkspaceId, focus]);

  const saveResume = async (patch: Partial<Resume>) => {
    const requestedItemId = patch.currentItemId ?? data.resume?.currentItemId ?? '', item = requestedItemId ? data.items.find(value => value.id === requestedItemId) : undefined, requestedWorkspaceId = patch.currentWorkspaceId ?? (activeWorkspaceId || data.resume?.currentWorkspaceId || ''), workspaceId = item ? item.workspaceId : data.workspaces.some(value => value.id === requestedWorkspaceId) ? requestedWorkspaceId : '', itemId = item?.id || '', next = { currentWorkspaceId: workspaceId, currentItemId: itemId, focus: Boolean((patch.focus ?? focus) && workspaceId), energy: patch.energy ?? energy }, fingerprint = JSON.stringify([next.currentWorkspaceId, next.currentItemId, next.focus, next.energy]);
    if (resumeFingerprint.current === fingerprint) return;
    resumeFingerprint.current = fingerprint;
    setData(current => ({ ...current, resume: { ...next, updatedAt: Date.now() } }));
    try { const response = await post<{ resume: Resume }>('/api/owner/cloud/resume', next); setData(current => ({ ...current, resume: response.data.resume })); } catch { resumeFingerprint.current = ''; notify(t('Контекст залишився на екрані, але сервер не зміг його зберегти.', 'De context bleef op het scherm, maar kon niet op de server worden opgeslagen.'),'warning'); }
  };

  const toggleFocus = () => {
    const next = !focus;
    setFocus(next);
    onFocusChange(next);
    void saveResume({ focus: next });
  };

  const changeEnergy = (next: Energy) => {
    setEnergy(next);
    void saveResume({ energy: next });
  };

  useEffect(() => { if (effectiveTab !== 'workspaces' && focus) { setFocus(false); onFocusChange(false); void saveResume({ focus: false }); } }, [effectiveTab, focus]);

  const createWorkspace = async () => {
    if (workspaceTitle.trim().length < 2) { setWorkspaceError(t('Додайте коротку назву робочого простору.', 'Voeg een korte naam voor de werkruimte toe.')); return; }
    setBusy(true); setWorkspaceError('');
    try {
      const response = await post<{ workspace: Workspace }>('/api/owner/cloud/workspaces/create', { title: workspaceTitle, description: workspaceDescription, template: workspaceTemplate });
      setWorkspaceTitle(''); setWorkspaceDescription(''); setCreateOpen(false); setActiveWorkspaceId(response.data.workspace.id);
      notify(t('Робочий простір готовий. Базову структуру вже створено.', 'De werkruimte is klaar. De basisstructuur is al aangemaakt.'),'success');
      await load(true);
    } catch (caught) { setWorkspaceError(t(`Не вдалося створити простір (${errorCode(caught)}).`, `De werkruimte kon niet worden gemaakt (${errorCode(caught)}).`)); }
    setBusy(false);
  };

  const resetCapture = () => { setCaptureText(''); setCaptureUrl(''); setCaptureFile(null); };
  const capture = async () => {
    setBusy(true); setCaptureError('');
    try {
      const payload: Record<string, unknown> = { kind: captureKind, workspaceId: captureWorkspaceId };
      if (captureKind === 'note') payload.text = captureText;
      if (captureKind === 'link') payload.url = captureUrl;
      if (captureKind === 'file') {
        if (!captureFile) throw new Error('FILE_REQUIRED');
        if (captureFile.size > 6 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
        payload.fileName = captureFile.name;
        payload.mimeType = captureFile.type || 'application/octet-stream';
        payload.fileData = await fileBase64(captureFile);
      }
      const response = await post<{ item: CloudItem; ai: { state: string } }>('/api/owner/cloud/capture', payload);
      resetCapture();
      notify(response.data.ai.state === 'suggested' ? t('Збережено. Назву й можливий простір підказано автоматично.', 'Opgeslagen. Naam en mogelijke werkruimte zijn automatisch voorgesteld.') : t('Збережено без зайвих кроків. ШІ не відповів, тому використано безпечну назву.', 'Zonder extra stappen opgeslagen. AI reageerde niet, daarom is een veilige naam gebruikt.'),'success');
      await load(true);
    } catch (caught) {
      const code = errorCode(caught);
      // Een leesfout van de schijf is geen serverfout: oorzaak en handeling komen uit shared/foutuitleg.ts.
      if (isLeesfout(caught)) { const u = bestandLeesUitleg(lang, bestandLeesfoutCode(caught)); setCaptureError(`${u.waarom} ${u.doen}`); setBusy(false); return; }
      setCaptureError(code === 'FILE_TOO_LARGE' ? t('На першому етапі файл має бути не більшим за 6 МБ.', 'In deze eerste fase mag een bestand niet groter zijn dan 6 MB.') : t(`Не вдалося зберегти (${code}). Ваш вибір залишився у формі.`, `Opslaan lukte niet (${code}). Uw invoer blijft in het formulier staan.`));
    }
    setBusy(false);
  };

  const placeItem = async (itemId: string, workspaceId: string) => {
    setBusy(true);
    try { await post(`/api/owner/cloud/items/${itemId}/place`, { workspaceId }); notify(t('Готово. Елемент тепер у робочому просторі.', 'Klaar. Het item staat nu in de werkruimte.'),'success'); await load(true); }
    catch (caught) { notify(t(`Не вдалося перемістити (${errorCode(caught)}).`, `Verplaatsen lukte niet (${errorCode(caught)}).`),'error'); }
    setBusy(false);
  };

  const updateStatus = async (itemId: string, status: CloudItem['status']) => {
    try { await post(`/api/owner/cloud/items/${itemId}/status`, { status }); setData(current => ({ ...current, items: current.items.map(item => item.id === itemId ? { ...item, status } : item), inbox: current.inbox.map(item => item.id === itemId ? { ...item, status } : item), recent: current.recent.map(item => item.id === itemId ? { ...item, status } : item) })); }
    catch (caught) { notify(t(`Статус не збережено (${errorCode(caught)}).`, `De status is niet opgeslagen (${errorCode(caught)}).`),'error'); }
  };

  const openItem = async (item: CloudItem) => {
    try {
      const response = await post<{ kind: 'file' | 'link' | 'note'; url?: string; text?: string; name?:string; mimeType?:string; sizeBytes?:number; data?:string }>(`/api/owner/cloud/items/${item.id}/open`);
      const localResume = { currentWorkspaceId: item.workspaceId, currentItemId: item.id, focus, energy, updatedAt: Date.now() }; resumeFingerprint.current = JSON.stringify([localResume.currentWorkspaceId, localResume.currentItemId, localResume.focus, localResume.energy]); setData(current => ({ ...current, resume: localResume }));
      if (response.data.kind === 'note') setOpenedNote({ title: item.title, text: response.data.text || '' });
      else if (response.data.kind === 'file' && response.data.data && isMermaidBestand(response.data.name || item.originalName)) setOpenedSchema({ title: item.title, code: new TextDecoder().decode(Uint8Array.from(atob(response.data.data), (c) => c.charCodeAt(0))) });
      else if(response.data.kind==='file'&&response.data.data){const raw:CloudRawFile={name:response.data.name||item.originalName||item.title,mimeType:response.data.mimeType||item.mimeType||'application/octet-stream',sizeBytes:Number(response.data.sizeBytes||item.sizeBytes||0),data:response.data.data};setOpenedFile(await loadCloudFilePreview(raw))}else if (response.data.url) window.open(response.data.url, '_blank', 'noopener,noreferrer');
    } catch (caught) { notify(t(`Не вдалося відкрити (${errorCode(caught)}).`, `Openen lukte niet (${errorCode(caught)}).`),'error'); }
  };

  const openItemConsumed = useRef(false);
  useEffect(() => {
    if (openItemConsumed.current || loading) return;
    let requested = '';
    try { requested = new URL(location.href).searchParams.get('open_item_id') || ''; } catch { requested = ''; }
    if (!requested) return;
    const known = [...data.items, ...data.inbox, ...data.recent].find(value => value.id === requested);
    openItemConsumed.current = true;
    // ZOEKDIEP-001 (05.11.2026): niet gevonden bleef de parameter vroeger stil hangen; nu een eerlijke melding en weg uit de adresbalk.
    if (!known) { try { const current = new URL(location.href); current.searchParams.delete('open_item_id'); history.replaceState({}, '', `${current.pathname}${current.search}${current.hash}`); } catch {} notify(t('Елемент із пошуку не знайдено в хмарі: можливо, його вже видалено або переміщено.', 'Het item uit de zoekresultaten staat niet (meer) in de cloud: misschien is het verwijderd of verplaatst.'), 'error'); return; }
    try { const current = new URL(location.href); current.searchParams.delete('open_item_id'); history.replaceState({}, '', `${current.pathname}${current.search}${current.hash}`); } catch {}
    void openItem(known);
  }, [loading, data.items, data.inbox, data.recent]);

  const runSearch = async () => {
    if (searchQuery.trim().length < 2) { setSearchError(t('Введіть щонайменше два символи.', 'Voer minstens twee tekens in.')); return; }
    setBusy(true); setSearchError('');
    try { const response = await post<{ results: CloudItem[] }>('/api/owner/cloud/search', { query: searchQuery, workspaceId: searchWorkspaceId }); setSearchResults(response.data.results); }
    catch (caught) { setSearchError(t(`Пошук не виконано (${errorCode(caught)}).`, `Zoeken lukte niet (${errorCode(caught)}).`)); }
    setBusy(false);
  };

  useEffect(() => { if (!globalSearchConsumed.current && effectiveTab === 'search' && initialGlobalQuery.trim().length >= 2 && !loading) { globalSearchConsumed.current = true; void runSearch(); } }, [effectiveTab, loading]);


  const startSuiteService = async (service: SuiteService) => {
    if (!service.connectEnabled || data.onboarding.nextService !== service.id) return;
    setProviderBusy(`suite:${service.id}`);
    try { const response = await post<{ authUrl?: string; alreadyGranted?: boolean }>('/api/owner/cloud/google-suite/onboarding/start', { locale: lang, returnTo: location.href, suiteService: service.id }); if (response.data.alreadyGranted) { await load(true); return; } if (!response.data.authUrl) throw new Error('GOOGLE_SUITE_AUTH_URL_MISSING'); location.assign(response.data.authUrl); }
    catch { notify(t('Не вдалося розпочати підключення Google Drive. Спробуйте ще раз.', 'Google Drive koppelen kon niet worden gestart. Probeer het opnieuw.'),'error'); setProviderBusy(''); }
  };

  // Live-audit 19.10 (F16): «Додати акаунт» stuurde zonder uitleg meteen naar Google. Eerst een korte bevestiging: wat er gebeurt en waarom.
  const [connectVraag, setConnectVraag] = useState<{ provider: Provider; accountRole: 'primary' | 'additional' } | null>(null);
  const connectProvider = async (provider: Provider, accountRole: 'primary' | 'additional' = 'primary') => {
    if (provider.id !== 'google' || !provider.connectEnabled) return;
    setConnectVraag({ provider, accountRole });
  };
  const connectProviderNu = async (provider: Provider, accountRole: 'primary' | 'additional' = 'primary') => {
    setConnectVraag(null);
    if (provider.id !== 'google' || !provider.connectEnabled) return;
    setProviderBusy(`${provider.id}:${accountRole}`);
    try { const response = await post<{ authUrl: string }>('/api/owner/cloud/providers/google/connect/start', { locale: lang, returnTo: location.href, accountRole }); if (!response.data.authUrl) throw new Error('CLOUD_GOOGLE_AUTH_URL_MISSING'); location.assign(response.data.authUrl); }
    catch { notify(t('Не вдалося розпочати підключення акаунта. Спробуйте ще раз.', 'Het koppelen van het account kon niet worden gestart. Probeer het opnieuw.'),'error'); setProviderBusy(''); }
  };

  const selectProviderAccount = async (provider: Provider, account: ProviderAccount) => {
    if (provider.id !== 'google' || account.status !== 'connected') return;
    setProviderBusy(`${provider.id}:${account.id}`);
    try { await post('/api/owner/cloud/providers/google/account/select', { accountId: account.id }); notify(t('Активний акаунт змінено.', 'Het actieve account is gewijzigd.'),'success'); await load(true); }
    catch { notify(t('Не вдалося змінити активний акаунт.', 'Het actieve account kon niet worden gewijzigd.'),'error'); }
    setProviderBusy('');
  };

  const disconnectProvider = async (provider: Provider, account: ProviderAccount) => {
    if (provider.id !== 'google') return;
    if (!window.confirm(t('Відключити цей акаунт? Локальні копії буде збережено.', 'Dit account loskoppelen? Lokale kopieën blijven bewaard.'))) return;
    setProviderBusy(`${provider.id}:${account.id}`);
    try { await post('/api/owner/cloud/providers/google/disconnect', { accountId: account.id, confirmation: 'DISCONNECT_GOOGLE_DRIVE', retainLocalCopies: true }); notify(t('Акаунт відключено. Локальні копії збережено.', 'Het account is losgekoppeld. Lokale kopieën zijn bewaard.'),'success'); await load(true); }
    catch { notify(t('Не вдалося відключити акаунт.', 'Het account kon niet worden losgekoppeld.'),'error'); }
    setProviderBusy('');
  };

  if (loading) return <section className='cloud-functional-loading' aria-busy='true'><LoaderCircle className='spin'/><strong>{t('Відновлюємо ваш контекст…', 'Uw context wordt hersteld…')}</strong></section>;

  return <div className={`cloud-functional energy-${energy}${focus ? ' is-focus' : ''}`} data-cloud-architecture='workspace-functional-v1'>
    {/* Gesloten lade: een VOLLE uitleg met de volgende stap, in de werkruimte — en de pagina blijft een pagina (menu, shapka
        en tabbladen staan erbuiten, in CanonicalChrome). Klacht 3 van de eigenaar, 20.10.2026. */}
    {gesloten ? (
      <div className='cloud-ruimte-melding' data-cloud-ruimte='gesloten' data-cloud-ruimte-code={gesloten.code}>
        <RuimteGeslotenVlak gesloten={gesloten} lang={lang} />
      </div>
    ) : null}
    {data.ruimte && data.ruimte.ok === true && (data.ruimte.ruimte === 'technisch' || data.ruimte.gedeeld) ? (
      <p className='cloud-ruimte-melding' role='status' data-cloud-ruimte={data.ruimte.gedeeld ? 'gedeeld' : 'technisch'}>
        {data.ruimte.ruimte === 'technisch' ? t('Технічний простір: ', 'Technische ruimte: ') : ''}{t(data.ruimte.uitleg.uk, data.ruimte.uitleg.nl)}
      </p>
    ) : null}
    <header className='cloud-functional-hero'>
      <div><span><Cloud/>{t('Ваш простір файлів', 'Uw bestandsruimte')}</span><h1>{t('Розумне хмарне сховище', 'Slimme cloudopslag')}</h1><p>{t('Зберігайте зараз. Організувати можна пізніше — система збереже контекст і запропонує наступний крок.', 'Sla nu op. Ordenen kan later — het systeem bewaart de context en stelt een volgende stap voor.')}</p></div>
      <aside><small>{t('Обліковий запис', 'Account')}</small><strong>{userEmail}</strong><button className='global-search-trigger' onClick={()=>setGlobalSearchOpen(true)}><Search/>{t('Пошук усюди','Overal zoeken')}</button><div className='cloud-energy' role='group' aria-label={t('Рівень енергії', 'Energieniveau')}>{(['low', 'medium', 'high'] as Energy[]).map(value => <button key={value} className={energy === value ? 'active' : ''} onClick={() => changeEnergy(value)}>{value === 'low' ? t('Мінімум', 'Minimum') : value === 'medium' ? t('Звично', 'Normaal') : t('Більше', 'Meer')}</button>)}</div></aside>
    </header>
    {effectiveTab === 'overview' && <Overview t={t} data={data} drivePreview={drivePreview} previewLoading={previewLoading} onCapture={() => onNavigateTab('capture')} onAccounts={() => onNavigateTab('accounts')} onWorkspace={id => { setActiveWorkspaceId(id); void saveResume({ currentWorkspaceId: id, currentItemId: '' }); onNavigateTab('workspaces'); }} onCreate={() => setCreateOpen(true)} />}
    {effectiveTab === 'workspaces' && <WorkspacePanel t={t} lang={lang} workspaces={data.workspaces} activeWorkspace={activeWorkspace} items={workspaceItems} focus={focus} onFocus={toggleFocus} onSelect={id => { setActiveWorkspaceId(id); void saveResume({ currentWorkspaceId: id, currentItemId: '' }); }} onCreate={() => setCreateOpen(true)} onOpen={openItem} onStatus={updateStatus} />}
    {effectiveTab === 'capture' && <CapturePanel t={t} id='cloud-quick-capture' error={captureError} kind={captureKind} setKind={setCaptureKind} text={captureText} setText={setCaptureText} url={captureUrl} setUrl={setCaptureUrl} file={captureFile} setFile={setCaptureFile} workspaceId={captureWorkspaceId} setWorkspaceId={setCaptureWorkspaceId} workspaces={data.workspaces} busy={busy} onCapture={capture} />}
    {effectiveTab === 'inbox' && <InboxPanel t={t} items={data.inbox} workspaces={data.workspaces} busy={busy} onPlace={placeItem} onOpen={openItem} onStatus={updateStatus} />}
    {effectiveTab === 'search' && <SearchPanel t={t} error={searchError} query={searchQuery} setQuery={setSearchQuery} workspaceId={searchWorkspaceId} setWorkspaceId={setSearchWorkspaceId} workspaces={data.workspaces} results={searchResults} busy={busy} onSearch={runSearch} onOpen={openItem} />}
    {effectiveTab === 'recent' && <ItemList t={t} items={data.recent} workspaces={data.workspaces} empty={t('Щойно збережені елементи з’являться тут.', 'Recent opgeslagen items verschijnen hier.')} onOpen={openItem} onStatus={updateStatus} />}
    {effectiveTab === 'calendar' && <GoogleCalendarView lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} service={data.onboarding.services.find(service=>service.id==='calendar')||null} onStart={service=>{void startSuiteService(service as SuiteService)}}/>} 
    {effectiveTab === 'photos' && <GooglePhotosView lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} service={data.onboarding.services.find(service=>service.id==='photos')||null} onStart={service=>{void startSuiteService(service as SuiteService)}} workspaces={data.workspaces}/>} 
    {effectiveTab === 'accounts' && <CloudAccountsPanel lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} onboarding={data.onboarding} providers={data.providers} busyProvider={providerBusy} drivePreview={drivePreview} previewLoading={previewLoading} onPreview={loadDrivePreview} onStart={startSuiteService} onConnect={connectProvider} onSelect={selectProviderAccount} onDisconnect={disconnectProvider}/>} 
    {CLOUD_M10_STAGE&&effectiveTab === 'accounts'&&<Suspense fallback={<p>Cloud integrations…</p>}><CloudVerbindingCentrumM4/><CloudAanbiedersM5/></Suspense>}
    {CLOUD_M10_STAGE&&effectiveTab === 'files'&&<Suspense fallback={<p>Cloud file workspace…</p>}><CloudM10Verkenner lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} googleAccounts={(googleProvider?.accounts||[]).map(a=>({id:a.id,provider:'google-drive',displayName:a.displayName||a.email,email:a.email,status:a.status}))}/></Suspense>}
    <a className='knop knop-stil is-klein' href={zoekPaginaUrl(lang, '', { bron: 'cloud' })} data-zoek-link='cloud'>{t('Пошук у файлах', 'Zoeken in bestanden')}</a>
      <GlobalSearchPanel lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} service='cloud' tab={effectiveTab} open={globalSearchOpen} onClose={()=>setGlobalSearchOpen(false)}/>
    {createOpen && <WorkspaceDialog t={t} error={workspaceError} title={workspaceTitle} setTitle={setWorkspaceTitle} description={workspaceDescription} setDescription={setWorkspaceDescription} template={workspaceTemplate} setTemplate={setWorkspaceTemplate} busy={busy} onClose={() => setCreateOpen(false)} onCreate={createWorkspace} />}
    {connectVraag && <div className='cloud-dialog-backdrop' role='presentation' onMouseDown={() => setConnectVraag(null)}><section className='cloud-note-dialog cloud-connect-dialog' role='dialog' aria-modal='true' aria-labelledby='cloud-connect-title' onMouseDown={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setConnectVraag(null); }}>
      <header><h2 id='cloud-connect-title'>{connectVraag.accountRole === 'additional' ? t('Додати акаунт Google', 'Google-account toevoegen') : t('Підключити Google Drive', 'Google Drive koppelen')}</h2><button type='button' onClick={() => setConnectVraag(null)} aria-label={t('Закрити', 'Sluiten')}><X/></button></header>
      <p>{t('Зараз ви перейдете на сторінку Google, щоб обрати акаунт і дозволити «Мій простір» працювати з файлами цього Диска. Після підтвердження Google поверне вас сюди.', 'U gaat zo naar de pagina van Google om een account te kiezen en «Mijn Ruimte» toegang te geven tot de bestanden van die Drive. Na bevestiging brengt Google u hier terug.')}</p>
      <p className='cloud-calm-empty'>{t('Пароль ви вводите лише на сторінці Google; тут він не зберігається. Доступ можна відкликати будь-коли кнопкою «Відключити».', 'Uw wachtwoord typt u alleen op de pagina van Google; hier wordt het niet bewaard. U kunt de toegang altijd intrekken met «Loskoppelen».')}</p>
      <footer className='cloud-connect-dialog-knoppen'><button type='button' onClick={() => setConnectVraag(null)}>{t('Скасувати', 'Annuleren')}</button><button type='button' className='cloud-primary' autoFocus onClick={() => void connectProviderNu(connectVraag.provider, connectVraag.accountRole)}><ShieldCheck/>{t('Перейти до Google', 'Naar Google')}</button></footer>
    </section></div>}
    {openedNote && <div className='cloud-dialog-backdrop' role='presentation' onMouseDown={() => setOpenedNote(null)}><section className='cloud-note-dialog' role='dialog' aria-modal='true' aria-labelledby='cloud-note-title' onMouseDown={event => event.stopPropagation()}><header><h2 id='cloud-note-title'>{openedNote.title}</h2><button onClick={() => setOpenedNote(null)} aria-label={t('Закрити', 'Sluiten')}><X/></button></header><pre>{openedNote.text}</pre></section></div>}{openedFile&&<CloudFileWorkbench preview={openedFile} lang={lang} onClose={()=>setOpenedFile(current=>{if(current)revokeMailAttachmentPreview(current);return null})}/>}{openedSchema && <MermaidSchema titel={openedSchema.title} code={openedSchema.code} lang={lang} onClose={() => setOpenedSchema(null)} />}
  </div>;
}

function Overview({ t, data, drivePreview, previewLoading, onCapture, onAccounts, onWorkspace, onCreate }: { t: (uk: string, nl: string) => string; data: Bootstrap; drivePreview: DrivePreviewFile[] | null; previewLoading: boolean; onCapture: () => void; onAccounts: () => void; onWorkspace: (id: string) => void; onCreate: () => void }) {
  return <main className='cloud-overview'>
    <section className='cloud-next-action'><div><Sparkles/><span>{t('Найменший наступний крок', 'Kleinste volgende stap')}</span><h2>{data.summary.inbox ? t('Розберіть один елемент — не весь список', 'Plaats één item — niet de hele lijst') : t('Збережіть те, що зараз перед вами', 'Sla op wat nu voor u ligt')}</h2><p>{data.summary.inbox ? t(`У швидкому вході ${data.summary.inbox}. Можна почати лише з одного.`, `Er staan ${data.summary.inbox} items in de snelle invoer. Eén is genoeg om te beginnen.`) : t('Назву й робочий простір можна не вигадувати.', 'U hoeft geen naam of werkruimte te bedenken.')}</p></div><button onClick={onCapture}><Upload/>{t('Швидко зберегти', 'Snel opslaan')}</button></section>
    <DriveConnectionOverview t={t} onboarding={data.onboarding} providers={data.providers} onOpen={onAccounts}/><section className='cloud-account-section' data-cloud-drive-materials='overview'><header><div><span>{t('Google Drive','Google Drive')}</span><h3>{t('Останні матеріали','Recente materialen')}</h3><p>{t('Матеріали з підключеного акаунта показуються тут без пошуку.','Materiaal van het gekoppelde account wordt hier zonder zoeken getoond.')}</p></div><button onClick={onAccounts}>{t('Переглянути всі файли','Alle bestanden bekijken')}</button></header>{previewLoading?<div className='cloud-calm-empty' aria-busy='true'><LoaderCircle className='spin'/><strong>{t('Завантажуємо матеріали…','Materialen laden…')}</strong></div>:drivePreview?.length?<div className='cloud-account-list'>{drivePreview.slice(0,6).map(file=><article key={file.id}><div><strong>{file.name||t('Файл без назви','Naamloos bestand')}</strong><small>{file.modifiedAt?new Date(file.modifiedAt).toLocaleString():file.mimeType}</small></div></article>)}</div>:<div className='cloud-calm-empty'><File/><strong>{t('У підключеному Google Drive поки немає матеріалів для цього огляду.','Er zijn nog geen materialen beschikbaar in het gekoppelde Google Drive-overzicht.')}</strong><button onClick={onAccounts}>{t('Відкрити Google Drive','Google Drive openen')}</button></div>}</section>

    <section className='cloud-summary-row'><article><Inbox/><strong>{data.summary.inbox}</strong><span>{t('у швидкому вході', 'in snelle invoer')}</span></article><article><FolderKanban/><strong>{data.summary.workspaces}</strong><span>{t('робочих просторів', 'werkruimtes')}</span></article><article><Brain/><strong>{data.summary.active}</strong><span>{t('потребують уваги', 'vragen aandacht')}</span></article><article><Check/><strong>{data.summary.done}</strong><span>{t('завершено', 'afgerond')}</span></article></section>
    <section className='cloud-workspace-preview'><header><div><span>{t('Ваші контексти', 'Uw contexten')}</span><h2>{t('Робочі простори', 'Werkruimtes')}</h2></div><button onClick={onCreate}><Plus/>{t('Новий простір', 'Nieuwe werkruimte')}</button></header>{data.workspaces.length ? <div className='cloud-workspace-grid'>{data.workspaces.slice(0, 6).map(workspace => <button key={workspace.id} className='cloud-workspace-card' onClick={() => onWorkspace(workspace.id)}><FolderKanban/><span><strong>{workspace.title}</strong><small>{workspace.itemCount} · {workspace.sections.length} {t('орієнтири', 'ankers')}</small></span><ChevronRight/></button>)}</div> : <div className='cloud-empty-calm'><FolderKanban/><strong>{t('Просторів ще немає — це нормально', 'Er zijn nog geen werkruimtes — dat is prima')}</strong><p>{t('Створіть один, коли з’явиться конкретний проєкт або тема.', 'Maak er één zodra er een concreet project of onderwerp is.')}</p><button onClick={onCreate}><Plus/>{t('Створити перший', 'Eerste maken')}</button></div>}</section>
  </main>;
}

function CapturePanel({ t, id, error, kind, setKind, text, setText, url, setUrl, file, setFile, workspaceId, setWorkspaceId, workspaces, busy, onCapture }: { t: (uk: string, nl: string) => string; id?: string; error: string; kind: CloudItem['kind']; setKind: (value: CloudItem['kind']) => void; text: string; setText: (value: string) => void; url: string; setUrl: (value: string) => void; file: File | null; setFile: (value: File | null) => void; workspaceId: string; setWorkspaceId: (value: string) => void; workspaces: Workspace[]; busy: boolean; onCapture: () => void }) {
  return <main className='cloud-capture-page' id={id}><section className='cloud-capture-card'><header><Upload/><div><span>{t('Smart Capture', 'Smart Capture')}</span><h2>{t('Зберегти без організації', 'Opslaan zonder te ordenen')}</h2><p>{t('Робочий простір необов’язковий. ШІ запропонує назву та контекст, а ви зможете підтвердити пізніше.', 'Een werkruimte is niet verplicht. AI stelt een naam en context voor; u kunt later bevestigen.')}</p></div></header><div className='cloud-kind-switch' role='group' aria-label={t('Тип збереження', 'Type opslag')}>{([{ id: 'note', icon: FileText, uk: 'Нотатка', nl: 'Notitie' }, { id: 'link', icon: Link2, uk: 'Посилання', nl: 'Link' }, { id: 'file', icon: File, uk: 'Файл', nl: 'Bestand' }] as const).map(option => <button key={option.id} className={kind === option.id ? 'active' : ''} onClick={() => setKind(option.id)}><option.icon/>{t(option.uk, option.nl)}</button>)}</div>{kind === 'note' && <label><span>{t('Що потрібно зберегти?', 'Wat wilt u opslaan?')}</span><textarea value={text} onChange={event => setText(event.target.value)} rows={8} placeholder={t('Вставте текст або коротку нотатку…', 'Plak tekst of schrijf een korte notitie…')}/></label>}{kind === 'link' && <label><span>{t('Посилання', 'Link')}</span><input type='url' value={url} onChange={event => setUrl(event.target.value)} placeholder='https://…'/></label>}{kind === 'file' && <label className='cloud-file-picker'><Upload/><span>{file?.name || t('Оберіть безпечний документ або зображення до 6 МБ', 'Kies een veilig document of beeld tot 6 MB')}</span><input type='file' accept='image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,text/markdown,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation' onChange={event => setFile(event.target.files?.[0] || null)}/></label>}<label><span>{t('Робочий простір — необов’язково', 'Werkruimte — optioneel')}</span><select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}><option value=''>{t('Залишити у швидкому вході', 'In snelle invoer laten')}</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}</select></label>{error&&<p id='cloud-capture-error' className='cloud-context-error' role='alert'>{error}</p>}<button className='cloud-primary' disabled={busy} onClick={onCapture} aria-describedby={error?'cloud-capture-error':undefined}>{busy ? <LoaderCircle className='spin'/> : <Sparkles/>}{t('Зберегти зараз', 'Nu opslaan')}</button></section></main>;
}

function WorkspacePanel({ t, lang, workspaces, activeWorkspace, items, focus, onFocus, onSelect, onCreate, onOpen, onStatus }: { t: (uk: string, nl: string) => string; lang: Lang; workspaces: Workspace[]; activeWorkspace: Workspace | null; items: CloudItem[]; focus: boolean; onFocus: () => void; onSelect: (id: string) => void; onCreate: () => void; onOpen: (item: CloudItem) => void; onStatus: (id: string, status: CloudItem['status']) => void }) {
  if (activeWorkspace) return <main className='cloud-workspace-detail'><header><button className='cloud-back' onClick={() => onSelect('')}><ChevronRight/>{t('Усі простори', 'Alle werkruimtes')}</button><div><span>{t('Робочий простір', 'Werkruimte')}</span><h2>{activeWorkspace.title}</h2><p>{activeWorkspace.description || t('Контекст уже створено. Додавайте матеріали без глибоких папок.', 'De context staat klaar. Voeg materiaal toe zonder diepe mappen.')}</p></div><button className={focus ? 'active cloud-focus-toggle' : 'cloud-focus-toggle'} onClick={onFocus}>{focus ? <Pause/> : <Play/>}{focus ? t('Вийти з фокусу', 'Focus verlaten') : t('Режим фокусу', 'Focusmodus')}</button></header><section className='cloud-section-strip' aria-label={t('Орієнтири простору', 'Ankers van de werkruimte')}>{activeWorkspace.sections.map(section => <span key={section.id}>{lang === 'uk' ? section.labelUk : section.labelNl}</span>)}</section><ItemList t={t} items={items} workspaces={workspaces} empty={t('Тут ще немає матеріалів. Швидко збережіть перший — структура вже готова.', 'Er is hier nog geen materiaal. Sla het eerste item op — de structuur staat al klaar.')} onOpen={onOpen} onStatus={onStatus}/></main>;
  return <main className='cloud-workspaces-page'><header><div><span>{t('Проєкти, теми й сфери життя', 'Projecten, onderwerpen en levensdomeinen')}</span><h2>{t('Робочі простори', 'Werkruimtes')}</h2><p>{t('Один простір замінює складне дерево папок і зберігає контекст.', 'Eén werkruimte vervangt een ingewikkelde mappenboom en bewaart de context.')}</p></div><button onClick={onCreate}><Plus/>{t('Новий простір', 'Nieuwe werkruimte')}</button></header>{workspaces.length ? <div className='cloud-workspace-grid large'>{workspaces.map(workspace => <button key={workspace.id} className='cloud-workspace-card' onClick={() => onSelect(workspace.id)}><FolderKanban/><span><strong>{workspace.title}</strong><small>{workspace.description || `${workspace.itemCount} ${t('елементів', 'items')}`}</small></span><em>{workspace.itemCount}</em><ChevronRight/></button>)}</div> : <div className='cloud-empty-calm'><FolderKanban/><strong>{t('Почніть з одного контексту', 'Begin met één context')}</strong><p>{t('Назва може бути простою: «Податки 2026», «Ремонт», «Документи лікаря».', 'Een eenvoudige naam is genoeg: ‘Belastingen 2026’, ‘Renovatie’, ‘Doktersdocumenten’.')}</p><button onClick={onCreate}><Plus/>{t('Створити', 'Maken')}</button></div>}</main>;
}

function InboxPanel({ t, items, workspaces, busy, onPlace, onOpen, onStatus }: { t: (uk: string, nl: string) => string; items: CloudItem[]; workspaces: Workspace[]; busy: boolean; onPlace: (itemId: string, workspaceId: string) => void; onOpen: (item: CloudItem) => void; onStatus: (id: string, status: CloudItem['status']) => void }) {
  return <main className='cloud-inbox-page'><header><div><span>{t('Без провини й дедлайнів', 'Zonder schuld of deadlines')}</span><h2>{t('Швидкий вхід', 'Snelle invoer')}</h2><p>{t('Це місце для всього, що ви зберегли без рішення. Розбирайте лише тоді, коли є ресурс.', 'Hier staat alles wat u zonder beslissing hebt opgeslagen. Plaats alleen iets wanneer u daar ruimte voor hebt.')}</p></div><strong>{items.length}</strong></header>{items.length ? <div className='cloud-inbox-list'>{items.map(item => { const suggested = workspaces.find(workspace => workspace.id === item.suggestedWorkspaceId); return <article key={item.id} className='cloud-inbox-item'><ItemIcon item={item}/><div className='cloud-item-copy'><span>{item.aiState === 'suggested' ? t('ШІ підказка', 'AI-voorstel') : t('Безпечна назва', 'Veilige naam')}</span><h3>{item.title}</h3><p>{item.description || item.excerpt || item.originalName || item.sourceUrl}</p><ItemMeta t={t} item={item}/></div><div className='cloud-inbox-actions'>{suggested && <button className='cloud-suggestion' disabled={busy} onClick={() => onPlace(item.id, suggested.id)}><Sparkles/><span>{t('Запропоновано', 'Voorgesteld')}</span><strong>{suggested.title}</strong></button>}<label><span>{t('Інший простір', 'Andere werkruimte')}</span><select defaultValue='' onChange={event => { if (event.target.value) onPlace(item.id, event.target.value); event.currentTarget.value = ''; }}><option value=''>{t('Обрати…', 'Kiezen…')}</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}</select></label><button onClick={() => onOpen(item)}>{t('Відкрити', 'Openen')}</button><StatusSelect t={t} item={item} onStatus={onStatus}/></div></article>; })}</div> : <div className='cloud-empty-calm'><Inbox/><strong>{t('Швидкий вхід порожній', 'Snelle invoer is leeg')}</strong><p>{t('Не потрібно підтримувати його порожнім. Це просто означає, що зараз тут нічого немає.', 'U hoeft dit niet leeg te houden. Er staat op dit moment gewoon niets.')}</p></div>}</main>;
}

function SearchPanel({ t, error, query, setQuery, workspaceId, setWorkspaceId, workspaces, results, busy, onSearch, onOpen }: { t: (uk: string, nl: string) => string; error: string; query: string; setQuery: (value: string) => void; workspaceId: string; setWorkspaceId: (value: string) => void; workspaces: Workspace[]; results: CloudItem[]; busy: boolean; onSearch: () => void; onOpen: (item: CloudItem) => void }) {
  return <main className='cloud-search-page'><section className='cloud-search-box'><header><Search/><div><span>{t('Context-Aware Search', 'Context-Aware Search')}</span><h2>{t('Шукайте так, як пам’ятаєте', 'Zoek zoals u het zich herinnert')}</h2><p>{t('Пошук враховує назву, зміст нотаток, теги, людей і робочий простір.', 'Zoeken gebruikt naam, notitie-inhoud, tags, personen en werkruimte.')}</p></div></header><div><input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void onSearch(); }} placeholder={t('Наприклад: рахунок від лікаря у липні', 'Bijvoorbeeld: doktersfactuur in juli')}/><select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)}><option value=''>{t('У всіх просторах', 'In alle werkruimtes')}</option>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.title}</option>)}</select><button disabled={busy} onClick={onSearch} aria-describedby={error?'cloud-search-error':undefined}>{busy ? <LoaderCircle className='spin'/> : <Search/>}{t('Знайти', 'Zoeken')}</button></div>{error&&<p id='cloud-search-error' className='cloud-context-error' role='alert'>{error}</p>}</section><ItemList t={t} items={results} workspaces={workspaces} empty={query ? t('Збігів поки немає. Спробуйте слова з контексту, а не точну назву.', 'Nog geen overeenkomsten. Probeer woorden uit de context in plaats van de exacte naam.') : t('Результати з’являться тут.', 'Resultaten verschijnen hier.')} onOpen={onOpen}/></main>;
}

function DriveConnectionOverview({ t, onboarding, providers, onOpen }: { t: (uk: string, nl: string) => string; onboarding: SuiteOnboarding; providers: Provider[]; onOpen: () => void }) {
  const drive = onboarding.services.find(service => service.id === 'drive');
  const google = providers.find(provider => provider.id === 'google');
  const primary = google?.primaryAccount || google?.accounts.find(account => account.accountRole === 'primary') || null;
  const connected = primary?.status === 'connected';
  const access = connected || Boolean(drive?.granted);
  return <section className='cloud-connection-overview' data-cloud-drive-state={connected ? 'connected' : access ? 'access' : 'not-connected'}><Cloud/><div><span>{t('Google Drive', 'Google Drive')}</span><strong>{connected ? t('Підключено', 'Gekoppeld') : access ? t('Доступ надано', 'Toegang verleend') : t('Підключити Google Drive', 'Google Drive koppelen')}</strong><p>{connected ? t('Файли доступні через підключений акаунт.', 'Bestanden zijn beschikbaar via het gekoppelde account.') : access ? t('Синхронізація файлів ще не запущена.', 'De synchronisatie van bestanden is nog niet gestart.') : t('Підключіть свій основний Google-акаунт, коли будете готові.', 'Koppel uw primaire Google-account wanneer u klaar bent.')}</p></div><button onClick={onOpen}>{access ? t('Переглянути акаунт', 'Account bekijken') : t('Підключити', 'Koppelen')}</button></section>;
}

function CloudAccountsPanel({ lang, sourceOrigin, tabContext, onboarding, providers, busyProvider, drivePreview, previewLoading, onPreview, onStart, onConnect, onSelect, onDisconnect }: { lang: Lang; sourceOrigin: string; tabContext: string; onboarding: SuiteOnboarding; providers: Provider[]; busyProvider: string; drivePreview: DrivePreviewFile[] | null; previewLoading: boolean; onPreview: () => void; onStart: (service: SuiteService) => void; onConnect: (provider: Provider, accountRole?: 'primary' | 'additional') => void; onSelect: (provider: Provider, account: ProviderAccount) => Promise<void> | void; onDisconnect: (provider: Provider, account: ProviderAccount) => void }) {
  const t = (uk: string, nl: string) => lang === 'uk' ? uk : nl;
  const drive = onboarding.services.find(service => service.id === 'drive');
  const google = providers.find(provider => provider.id === 'google');
  const primary = google?.primaryAccount || google?.accounts.find(account => account.accountRole === 'primary') || null;
  const additional = (google?.accounts || []).filter(account => account.accountRole === 'additional');
  const connected = primary?.status === 'connected';
  const access = connected || Boolean(drive?.granted);
  const state = connected ? 'connected' : access ? 'access' : 'not-connected';
  const busy = busyProvider === 'suite:drive';
  const openMail = () => location.assign('https://mail.tarasevych.com/accounts');
  return <main className='cloud-account-layout' data-cloud-human-accounts='v1'><header><div><span>{t('Підключення','Koppelingen')}</span><h2>{t('Акаунти хмарного сховища','Accounts voor cloudopslag')}</h2><p>{t('Основний акаунт і додаткові сховища керуються окремо.','Het primaire account en extra opslagaccounts worden afzonderlijk beheerd.')}</p></div></header><section className='cloud-account-section'><header><div><span>{t('Основний акаунт','Primair account')}</span><h3>{state === 'not-connected' ? t('Підключити Google Drive','Google Drive koppelen') : onboarding.primaryAccount.email || primary?.email || 'Google Drive'}</h3></div><span className={`cloud-human-status ${state}`}>{connected ? t('Підключено','Gekoppeld') : access ? t('Доступ надано','Toegang verleend') : t('Не підключено','Niet gekoppeld')}</span></header><article className='cloud-human-card'><Cloud/><div><strong>{onboarding.primaryAccount.email || primary?.email || t('Ваш Google-акаунт','Uw Google-account')}</strong><p>{connected ? t('Файли доступні через цей акаунт.','Bestanden zijn beschikbaar via dit account.') : access ? t('Синхронізація файлів ще не запущена.','De synchronisatie van bestanden is nog niet gestart.') : drive?.status === 'waiting_previous_consent' ? t('Спочатку надайте доступ до Gmail у розділі Пошта → Акаунти.','Verleen eerst toegang tot Gmail via E-mail → Accounts.') : t('Надайте доступ, щоб бачити файли у вашому приватному просторі.','Verleen toegang om bestanden in uw privéruimte te bekijken.')}</p>{state === 'not-connected' && drive?.status === 'configuration_missing' && <small>{t('Підключення тимчасово недоступне. Адміністратор завершує налаштування.','Koppelen is tijdelijk niet beschikbaar. De beheerder rondt de configuratie af.')}</small>}</div>{state === 'not-connected' && drive?.status === 'waiting_previous_consent' ? <button onClick={openMail}>{t('Відкрити Пошту','E-mail openen')}</button> : state === 'not-connected' ? <button className='cloud-primary' disabled={!drive?.connectEnabled || onboarding.nextService !== 'drive' || busy} onClick={() => drive && onStart(drive)}>{busy ? <LoaderCircle className='spin'/> : <ShieldCheck/>}{t('Надати доступ','Toegang verlenen')}</button> : primary && connected ? <button className='cloud-provider-account-disconnect' disabled={Boolean(busyProvider)} aria-label={t('Відключити','Loskoppelen')} onClick={() => google && onDisconnect(google, primary)}><Unplug/>{t('Відключити','Loskoppelen')}</button> : null}</article>{access&&google&&<DriveBrowser lang={lang} sourceOrigin={sourceOrigin} tabContext={tabContext} provider={google} ownerKey={google?.account?.email||google?.primaryAccount?.email||''} startAtRoot onSelect={account=>onSelect(google,account as unknown as Parameters<typeof onSelect>[1])}/>} {access&&drivePreview!==null&&<div className='cloud-account-list' data-cloud-live-preview='on-demand'><header><div><strong>{t('Останні файли з Google Drive','Recente Google Drive-bestanden')}</strong><small>{t('Показано напряму з Google. Індексацію та фонову синхронізацію не запущено.','Rechtstreeks van Google getoond. Indexering en achtergrondsynchronisatie zijn niet gestart.')}</small></div><button disabled={previewLoading} onClick={onPreview}>{previewLoading?t('Завантажуємо…','Laden…'):t('Оновити список','Lijst vernieuwen')}</button></header>{drivePreview.length?drivePreview.map(file=><article key={file.id}><File/><div><strong>{file.name||t('Файл без назви','Naamloos bestand')}</strong><small>{file.modifiedAt?new Date(file.modifiedAt).toLocaleString(lang==='uk'?'uk-UA':'nl-BE'):t('Дата не вказана','Datum niet vermeld')}</small></div>{file.webViewLink&&<button onClick={()=>window.open(file.webViewLink,'_blank','noopener,noreferrer')}>{t('Відкрити','Openen')}</button>}</article>):<p className='cloud-calm-empty'>{t('Google не повернув файлів для цього перегляду.','Google heeft geen bestanden voor dit overzicht teruggegeven.')}</p>}</div>}</section><section className='cloud-account-section'><header><div><span>{t('За потреби','Indien nodig')}</span><h3>{t('Додаткові акаунти','Extra accounts')}</h3></div>{google && <button disabled={!google.connectEnabled || Boolean(busyProvider)} onClick={() => onConnect(google, 'additional')}><Plus/>{t('Додати акаунт','Account toevoegen')}</button>}</header>{additional.length ? <div className='cloud-account-list'>{additional.map(account => <article key={account.id} className={google?.activeAccountId === account.id ? 'active' : ''}><button disabled={account.status !== 'connected' || Boolean(busyProvider)} onClick={() => google && onSelect(google, account)}><Cloud/><span><strong>{account.displayName || account.email}</strong><small>{account.email}</small></span>{google?.activeAccountId === account.id && <em><Check/>{t('Активний','Actief')}</em>}</button><button className='cloud-provider-account-disconnect' disabled={Boolean(busyProvider)} aria-label={t('Відключити','Loskoppelen')} onClick={() => google && onDisconnect(google, account)}><Unplug/></button></article>)}</div> : <p className='cloud-calm-empty'>{t('Додаткових акаунтів ще немає.','Er zijn nog geen extra accounts.')}</p>}<small className='cloud-privacy-note'><ShieldCheck/>{t('Паролі не зберігаються. Відключення не видаляє локальні копії файлів.','Wachtwoorden worden niet opgeslagen. Loskoppelen verwijdert geen lokale bestandskopieën.')}</small></section><section className='cloud-other-services'><h3>{t('Інші сховища','Andere opslagdiensten')}</h3>{providers.filter(provider => provider.id !== 'google').map(provider => <article key={provider.id}><span className={`cloud-provider-mark provider-${provider.id}`}>{provider.id === 'onedrive' ? '1D' : 'DB'}</span><div><strong>{provider.name}</strong><small>{t('Ще не доступно','Nog niet beschikbaar')}</small></div><button disabled>{t('Підключити','Koppelen')}</button></article>)}</section></main>;
}

function ItemList({ t, items, workspaces, empty, onOpen, onStatus }: { t: (uk: string, nl: string) => string; items: CloudItem[]; workspaces: Workspace[]; empty: string; onOpen: (item: CloudItem) => void; onStatus?: (id: string, status: CloudItem['status']) => void }) {
  if (!items.length) return <div className='cloud-empty-calm'><File/><strong>{empty}</strong></div>;
  return <section className='cloud-item-list'>{items.map(item => <article key={item.id}><ItemIcon item={item}/><div className='cloud-item-copy'><h3>{item.title}</h3><p>{item.description || item.excerpt || item.originalName || item.sourceUrl}</p><ItemMeta t={t} item={item}/>{item.workspaceId && <small className='cloud-workspace-chip'><FolderKanban/>{workspaces.find(workspace => workspace.id === item.workspaceId)?.title || t('Робочий простір', 'Werkruimte')}</small>}</div><div className='cloud-item-actions'><button onClick={() => onOpen(item)}>{t('Відкрити', 'Openen')}</button>{onStatus && <StatusSelect t={t} item={item} onStatus={onStatus}/>}</div></article>)}</section>;
}

function ItemIcon({ item }: { item: CloudItem }) { return <span className={`cloud-item-icon kind-${item.kind}`}>{item.kind === 'file' ? <File/> : item.kind === 'link' ? <Link2/> : <FileText/>}</span>; }
function ItemMeta({ t, item }: { t: (uk: string, nl: string) => string; item: CloudItem }) { return <div className='cloud-item-meta'><span>{new Date(item.updatedAt).toLocaleDateString()}</span>{item.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}<span>{item.status === 'captured' ? t('Збережено', 'Opgeslagen') : item.status === 'waiting_review' ? t('Очікує перегляду', 'Wacht op controle') : item.status === 'in_progress' ? t('В роботі', 'In uitvoering') : t('Завершено', 'Afgerond')}</span></div>; }
function StatusSelect({ t, item, onStatus }: { t: (uk: string, nl: string) => string; item: CloudItem; onStatus: (id: string, status: CloudItem['status']) => void }) { return <label className='cloud-status-select'><span className='sr-only'>{t('Статус', 'Status')}</span><select value={item.status} onChange={event => onStatus(item.id, event.target.value as CloudItem['status'])}>{statusOrder.map(status => <option key={status} value={status}>{status === 'captured' ? t('Збережено', 'Opgeslagen') : status === 'waiting_review' ? t('Очікує перегляду', 'Wacht op controle') : status === 'in_progress' ? t('В роботі', 'In uitvoering') : t('Завершено', 'Afgerond')}</option>)}</select></label>; }

function WorkspaceDialog({ t, error, title, setTitle, description, setDescription, template, setTemplate, busy, onClose, onCreate }: { t: (uk: string, nl: string) => string; error: string; title: string; setTitle: (value: string) => void; description: string; setDescription: (value: string) => void; template: Workspace['template']; setTemplate: (value: Workspace['template']) => void; busy: boolean; onClose: () => void; onCreate: () => void }) {
  return <div className='cloud-dialog-backdrop' role='presentation' onMouseDown={onClose}><section className='cloud-workspace-dialog' role='dialog' aria-modal='true' aria-labelledby='cloud-workspace-dialog-title' onMouseDown={event => event.stopPropagation()}><header><div><span>{t('Project Starter', 'Project Starter')}</span><h2 id='cloud-workspace-dialog-title'>{t('Новий робочий простір', 'Nieuwe werkruimte')}</h2></div><button onClick={onClose} aria-label={t('Закрити', 'Sluiten')}><X/></button></header><label><span>{t('Проста назва', 'Eenvoudige naam')}</span><input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder={t('Наприклад: Податки 2026', 'Bijvoorbeeld: Belastingen 2026')} aria-invalid={Boolean(error)} aria-describedby={error?'cloud-workspace-error':undefined}/></label>{error&&<p id='cloud-workspace-error' className='cloud-context-error' role='alert'>{error}</p>}<label><span>{t('Короткий контекст — необов’язково', 'Korte context — optioneel')}</span><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)}/></label><fieldset><legend>{t('Шаблон базової структури', 'Sjabloon voor basisstructuur')}</legend>{([{ id: 'project', uk: 'Проєкт', nl: 'Project' }, { id: 'documentation', uk: 'Документація', nl: 'Documentatie' }, { id: 'meeting', uk: 'Зустріч', nl: 'Vergadering' }, { id: 'personal', uk: 'Особисте', nl: 'Persoonlijk' }] as const).map(option => <label key={option.id} className={template === option.id ? 'active' : ''}><input type='radio' name='cloud-template' checked={template === option.id} onChange={() => setTemplate(option.id)}/><FolderKanban/><span>{t(option.uk, option.nl)}</span></label>)}</fieldset><footer><button onClick={onClose}>{t('Не зараз', 'Niet nu')}</button><button className='cloud-primary' disabled={busy} onClick={onCreate}>{busy ? <LoaderCircle className='spin'/> : <Plus/>}{t('Створити простір', 'Werkruimte maken')}</button></footer></section></div>;
}
