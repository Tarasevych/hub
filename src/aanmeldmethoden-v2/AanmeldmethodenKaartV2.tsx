// Віха M2 (UI-015A, №167): головний компонент карткового подання розділу «Способи входу».
// Поєднує динамічні згортані групи з лічильниками, компактні плитки постачальників, двомовний пошук
// та спільну бічну панель подробиць поруч із чинним оглядом vNext / «Макетом».
import { ChevronDown, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InfoTip } from '../InfoTip';
import { api } from '../platform/client';
import type { AccessPlanePanels } from '../toegangslaag-panelen';
import { ToegangWijziging, wijzigingUitUrl } from '../ToegangWijziging';
import {
  ANKER_NAAR_KAART,
  filterKaarten,
  snapshotNaarKaartenV2,
  TAB_NAAR_KAART,
  weergaveGroep,
  type Aanbieder,
  type Categorie,
  type Fase,
  type KaartId,
  type MethodeKaart,
  type SnapshotInvoer,
  type Taal,
} from './aanmeldmethoden-model';
import './aanmeldmethoden-v2.css';
import { BeveiligingExtrasV2 } from './BeveiligingExtrasV2';
import { DetailsV2Props, MethodeDetailsV2 } from './MethodeDetailsV2';
import { MethodeFilterV2 } from './MethodeFilterV2';
import { MethodeHeroV2 } from './MethodeHeroV2';
import { MethodeKaartV2 } from './MethodeKaartV2';

type PaneelProps = ComponentProps<typeof AccessPlanePanels>;
type GroepId = 'verbonden' | 'beschikbaar' | 'extra' | 'anderen';

const INKLAP_SLEUTEL = 'amv2-ingeklapt';

const leesInklap = (): GroepId[] => {
  try {
    const v = JSON.parse(localStorage.getItem(INKLAP_SLEUTEL) || '[]');
    return Array.isArray(v)
      ? v.filter((x): x is GroepId => ['verbonden', 'beschikbaar', 'extra', 'anderen'].includes(String(x)))
      : [];
  } catch {
    return [];
  }
};

const useSmalVenster = (): boolean => {
  const [smal, setSmal] = useState(() => (typeof window === 'undefined' ? false : window.innerWidth <= 859));
  useEffect(() => {
    const f = () => setSmal(window.innerWidth <= 859);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return smal;
};

type LevendAanbieder = {
  id: string;
  stand: string;
  klaarVoorKoppeling: boolean;
  gekoppeld?: { label: string; op: string } | null;
};

export default function AanmeldmethodenKaartV2(
  p: PaneelProps & {
    weergaveKiezer?: ReactNode;
    onSessies?: () => void;
  },
) {
  const lang: Taal = p.lang === 'nl' ? 'nl' : 'uk';
  const tr = (uk: string, nl: string) => (lang === 'nl' ? nl : uk);
  const smal = useSmalVenster();
  const [categorie, setCategorie] = useState<'alle' | Categorie>('alle');
  const [zoek, setZoek] = useState('');
  const [openId, setOpenId] = useState<KaartId | null>(null);
  const [dicht, setDicht] = useState<GroepId[]>(leesInklap);
  const [wijziging] = useState(wijzigingUitUrl);
  const [extraAanbieders, setExtraAanbieders] = useState<Aanbieder[] | null>(null);
  const [koppelMelding, setKoppelMelding] = useState('');

  const geladen = p.data.factors.some((f) => f.status !== 'loading');
  const fase: Fase = geladen ? 'klaar' : 'laden';
  const snapshotHeeftAanbieders = Array.isArray((p.data as unknown as SnapshotInvoer).aanbieders);

  // Резервне отримання списку постачальників, якщо в переданому знімку поле aanbieders відсутнє
  useEffect(() => {
    if (snapshotHeeftAanbieders) return;
    let actief = true;
    void api
      .post('/api/owner/aanmeld/vnext/aanbieders', p.context)
      .then((r) => {
        if (!actief) return;
        const lijst = (r.data as { aanbieders?: LevendAanbieder[] })?.aanbieders;
        if (!Array.isArray(lijst)) return;
        const gemapt: Aanbieder[] = lijst
          .filter((a) => ['microsoft', 'apple', 'discord', 'telegram'].includes(a.id))
          .map((a) => ({
            id: a.id,
            status: a.gekoppeld
              ? 'actief'
              : a.klaarVoorKoppeling
                ? 'gereed-om-te-koppelen'
                : 'niet-geconfigureerd',
            accountLabel: a.gekoppeld?.label,
            gekoppeldOp: a.gekoppeld?.op,
            actieKoppelUrl: a.klaarVoorKoppeling ? '/api/owner/aanmeld/vnext/start' : undefined,
            kanLosmaken: !p.data.lockout?.protected,
            losmaakUrl: '/api/owner/aanmeld/vnext/ontkoppel',
          }));
        setExtraAanbieders(gemapt);
      })
      .catch(() => undefined);
    return () => {
      actief = false;
    };
  }, [snapshotHeeftAanbieders, p.context, p.data.lockout?.protected]);

  const samengesteldSnapshot = useMemo<SnapshotInvoer>(() => {
    const basis = p.data as unknown as SnapshotInvoer;
    if (Array.isArray(basis.aanbieders)) return basis;
    if (extraAanbieders) return { ...basis, aanbieders: extraAanbieders };
    return basis;
  }, [p.data, extraAanbieders]);

  const kaarten = useMemo(() => snapshotNaarKaartenV2(fase, samengesteldSnapshot), [fase, samengesteldSnapshot]);
  const zichtbaar = useMemo(
    () => filterKaarten(kaarten, categorie, zoek, p.alleen),
    [kaarten, categorie, zoek, p.alleen],
  );
  const openKaart = openId ? kaarten.find((k) => k.id === openId) : undefined;
  const lockout = !!p.data.lockout?.protected;

  const ankerGedaan = useRef('');
  useEffect(() => {
    if (fase === 'laden') return;
    const anker = (() => {
      try {
        return decodeURIComponent(location.hash.replace(/^#/, ''));
      } catch {
        return '';
      }
    })();
    const sleutel = `${p.tab || 'methods'}|${anker}`;
    if (ankerGedaan.current === sleutel) return;
    ankerGedaan.current = sleutel;
    const doel = ANKER_NAAR_KAART[anker] || (p.tab && p.tab !== 'methods' ? TAB_NAAR_KAART[p.tab] : undefined);
    if (!doel) return;
    const el = document.querySelector<HTMLElement>(`[data-kaart="${doel}"]`);
    if (el) {
      document.querySelectorAll('[data-access-actief]').forEach((x) => x.removeAttribute('data-access-actief'));
      el.setAttribute('data-access-actief', '1');
      try {
        el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      } catch {
        /* без прокрутки */
      }
    }
    if (ANKER_NAAR_KAART[anker]) setOpenId(doel);
  }, [fase, p.tab]);

  useEffect(() => {
    if (p.otpauth && !p.data.totp.enrolled) setOpenId('totp');
  }, [p.otpauth, p.data.totp.enrolled]);

  useEffect(() => {
    if (p.recovery.length) setOpenId('recovery');
  }, [p.recovery.length]);

  const wisselGroep = (g: GroepId) =>
    setDicht((oud) => {
      const nieuw = oud.includes(g) ? oud.filter((x) => x !== g) : [...oud, g];
      try {
        localStorage.setItem(INKLAP_SLEUTEL, JSON.stringify(nieuw));
      } catch {
        /* сховище недоступне */
      }
      return nieuw;
    });

  const startKoppelen = useCallback(
    async (aanbiederId: string) => {
      setKoppelMelding('');
      if (aanbiederId === 'telegram') {
        const sectie = document.querySelector<HTMLElement>('[data-telegram-sectie]');
        if (sectie) {
          sectie.scrollIntoView({ behavior: 'smooth', block: 'start' });
          sectie.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
          setOpenId(null);
          return;
        }
      }
      const r = await api.post('/api/owner/aanmeld/vnext/start', { ...p.context, id: aanbiederId });
      const url = (r.data as { url?: string })?.url;
      if (url) {
        window.location.assign(url);
        return;
      }
      setKoppelMelding(
        aanbiederId === 'telegram'
          ? tr('Скористайтеся розділом «Telegram» нижче на цій сторінці.', 'Gebruik de sectie «Telegram» hieronder op deze pagina.')
          : tr('Не вдалося відкрити сторінку постачальника.', 'De pagina van de aanbieder kon niet worden geopend.'),
      );
    },
    [p.context, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const startEerste = () => {
    const doel =
      kaarten.find((k) => k.staat === 'ready' && (k.actie === 'setup' || k.actie === 'connect')) ||
      kaarten.find((k) => k.actie === 'manage');
    setCategorie('alle');
    if (doel) setOpenId(doel.id);
  };

  const groepen: Array<{ id: GroepId; titel: string; tip?: string; kaarten: MethodeKaart[] }> = [
    {
      id: 'verbonden',
      titel: fase === 'klaar' ? tr('Підключені', 'Gekoppeld') : tr('Основні способи', 'Hoofdmethoden'),
      kaarten: [],
    },
    {
      id: 'beschikbaar',
      titel: tr('Доступні', 'Beschikbaar'),
      tip: tr(
        'Тут показані способи, які знає сервер. Кнопка «Підключити» з’являється лише тоді, коли ключі постачальника налаштовані та самоперевірка пройдена.',
        'Hier staan alleen methoden die de server kent. «Koppelen» verschijnt pas nadat de sleutels van de aanbieder zijn ingesteld en de zelftest geslaagd is.',
      ),
      kaarten: [],
    },
    { id: 'extra', titel: tr('Додатковий захист', 'Extra beveiliging'), kaarten: [] },
    { id: 'anderen', titel: tr('Доступ іншим', 'Toegang voor anderen'), kaarten: [] },
  ];

  for (const k of zichtbaar) {
    const g: GroepId =
      fase === 'klaar'
        ? weergaveGroep(k)
        : k.groep === 'hoofd'
          ? 'verbonden'
          : k.groep === 'beschikbaar'
            ? 'beschikbaar'
            : k.groep;
    groepen.find((x) => x.id === g)!.kaarten.push(k);
  }

  const detailsProps: DetailsV2Props = {
    ...p,
    lang,
    smal,
    lockout,
    mustChange: !!p.data.password?.mustChange,
    totpEnrolled: !!p.data.totp?.enrolled || !!p.data.factors?.find((f) => f.id === 'totp')?.enrolled,
  };

  return (
    <div className='amv2' data-amv2-pagina='' data-fase={fase} lang={lang}>
      {p.weergaveKiezer}
      {wijziging ? <ToegangWijziging lang={lang} context={p.context} id={wijziging} onChange={() => void p.load()} /> : null}
      {!p.alleen ? <MethodeHeroV2 lang={lang} onStart={startEerste} startUit={fase !== 'klaar'} /> : null}
      {p.notice && !openKaart ? (
        <p className='amv2-melding' role='status'>
          {p.notice}
        </p>
      ) : null}
      {koppelMelding ? (
        <p className='amv2-melding' role='status'>
          {koppelMelding}
        </p>
      ) : null}
      {p.tempPassword ? (
        <div className='amv2-banner'>
          <span>
            <strong>{tr('Тимчасовий пароль', 'Tijdelijk wachtwoord')}</strong>
            <code className='access-plane-mono'>{p.tempPassword}</code>
          </span>
        </div>
      ) : null}

      <MethodeFilterV2 lang={lang} categorie={categorie} onCategorie={setCategorie} onZoek={setZoek} />

      {!zichtbaar.length ? (
        <p className='amv2-leeg' role='status'>
          {tr('Нічого не знайдено. Змініть пошуковий запит або категорію.', 'Niets gevonden. Pas de zoekopdracht of categorie aan.')}
        </p>
      ) : null}

      {groepen
        .filter((g) => g.kaarten.length > 0)
        .map((g) => {
          const isDicht = dicht.includes(g.id);
          return (
            <section key={g.id} className={`amv2-groep groep-${g.id}`} aria-labelledby={`amv2-g-${g.id}`}>
              <header className='amv2-groep-kop'>
                <h3 id={`amv2-g-${g.id}`}>
                  {g.titel}
                  <span className='amv2-teller' aria-label={tr(`кількість: ${g.kaarten.length}`, `aantal: ${g.kaarten.length}`)}>
                    {g.kaarten.length}
                  </span>
                </h3>
                {g.tip ? (
                  <InfoTip label={tr('Про доступні способи входу', 'Over beschikbare aanmeldmethoden')}>
                    <p>{g.tip}</p>
                  </InfoTip>
                ) : null}
                <button
                  type='button'
                  className='amv2-inklap'
                  aria-expanded={!isDicht}
                  aria-controls={`amv2-r-${g.id}`}
                  onClick={() => wisselGroep(g.id)}
                  aria-label={
                    isDicht
                      ? tr(`Розгорнути групу «${g.titel}»`, `Groep «${g.titel}» uitklappen`)
                      : tr(`Згорнути групу «${g.titel}»`, `Groep «${g.titel}» inklappen`)
                  }
                >
                  <ChevronDown aria-hidden='true' />
                </button>
              </header>
              <div id={`amv2-r-${g.id}`} className={`amv2-raster${g.id === 'beschikbaar' ? ' tegels' : ''}`}>
                {g.kaarten
                  .filter((k) => !isDicht || k.staat === 'attention')
                  .map((k) => (
                    <MethodeKaartV2
                      key={k.id}
                      k={k}
                      lang={lang}
                      compact={g.id === 'beschikbaar'}
                      onOpen={(x) => setOpenId(x.id)}
                      onRetry={() => void p.load()}
                      onConnect={(x) => void startKoppelen(x.id.slice('aanbieder:'.length))}
                    />
                  ))}
              </div>
            </section>
          );
        })}

      {!p.alleen && (categorie === 'alle' || categorie === 'zakhyst') && !zoek ? (
        <section className='amv2-groep groep-extras' aria-labelledby='amv2-g-extras'>
          <header className='amv2-groep-kop'>
            <h3 id='amv2-g-extras'>{tr('Сеанси та підтвердження', 'Sessies en bevestiging')}</h3>
          </header>
          <BeveiligingExtrasV2 lang={lang} onSessies={p.onSessies} />
        </section>
      ) : null}

      {openKaart ? (
        <MethodeDetailsV2 k={openKaart} p={detailsProps} onClose={() => setOpenId(null)} onStartKoppelen={startKoppelen} />
      ) : null}
    </div>
  );
}

export { RefreshCw, ShieldAlert };
