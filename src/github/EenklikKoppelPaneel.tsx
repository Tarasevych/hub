// Eénkliks koppelen van GitHub zonder dat de gebruiker handmatig sleutels hoeft aan te maken of te kopiëren:
//  • gebruikt direct OAuth als er al een platform- of ruimte-app klaarstaat;
//  • of verstuurt automatisch het officiële GitHub App Manifest zodat een eigen server in één bevestiging gekoppeld is;
//  • plus aanmelden met een korte 8-teken apparaatcode (Device Flow) met automatische statuscontrole.
import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, Github, Laptop, Loader2, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { emitCanonicalNotice } from '../canoniek-meldingen';
import type { GithubEenklikFeiten } from '../../shared/github-werkruimte';
import { GhDialoog, GhMelding, ghFoutTekst, ghPost, type Tr } from './github-client';

function verstuurManifestFormulier(actionUrl: string, manifestJson: string) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';
  const veld = document.createElement('input');
  veld.type = 'hidden';
  veld.name = 'manifest';
  veld.value = manifestJson;
  form.appendChild(veld);
  document.body.appendChild(form);
  form.submit();
}

export default function EenklikKoppelPaneel({
  tr,
  gekoppeld,
  login,
  eenklik,
  onGekoppeld,
}: {
  tr: Tr;
  gekoppeld: boolean;
  login?: string;
  eenklik?: GithubEenklikFeiten | null;
  onGekoppeld: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState('');
  const [apparaatOpen, setApparaatOpen] = useState(false);
  const [apparaatBezig, setApparaatBezig] = useState(false);
  const [apparaatGegevens, setApparaatGegevens] = useState<{
    state: string;
    userCode: string;
    verificationUri: string;
    interval: number;
  } | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!apparaatOpen || !apparaatGegevens?.state) {
      if (pollTimer.current) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    const wachtMs = Math.max(5, apparaatGegevens.interval || 5) * 1000;
    const id = window.setInterval(() => {
      void ghPost<{ status: 'wachten' | 'gekoppeld'; login?: string }>('device/poll', { state: apparaatGegevens.state })
        .then((uit) => {
          if (uit.status === 'gekoppeld') {
            window.clearInterval(id);
            pollTimer.current = null;
            setApparaatOpen(false);
            setApparaatGegevens(null);
            emitCanonicalNotice({
              text: tr(
                `GitHub успішно підключено (@${uit.login || ''})`,
                `GitHub is gekoppeld (@${uit.login || ''})`,
              ),
              kind: 'success',
              source: 'github',
              retain: true,
            });
            onGekoppeld();
          }
        })
        .catch((e) => {
          window.clearInterval(id);
          pollTimer.current = null;
          setFout(ghFoutTekst(e, tr));
          setApparaatOpen(false);
        });
    }, wachtMs);
    pollTimer.current = id;
    return () => window.clearInterval(id);
  }, [apparaatOpen, apparaatGegevens, onGekoppeld, tr]);

  const startEenklik = async () => {
    setBezig(true);
    setFout('');
    try {
      const uit = await ghPost<
        | { soort: 'oauth'; authUrl: string }
        | { soort: 'manifest'; actionUrl: string; manifestJson: string }
      >('eenklik/start');
      if (uit.soort === 'oauth' && uit.authUrl.startsWith('https://github.com/')) {
        window.location.assign(uit.authUrl);
        return;
      }
      if (uit.soort === 'manifest' && uit.actionUrl.startsWith('https://github.com/settings/apps/new') && uit.manifestJson) {
        verstuurManifestFormulier(uit.actionUrl, uit.manifestJson);
        return;
      }
      throw new Error('GITHUB_OAUTH_AFGEWEZEN');
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
      setBezig(false);
    }
  };

  const startApparaatCode = async () => {
    setApparaatBezig(true);
    setFout('');
    try {
      const uit = await ghPost<{
        state: string;
        userCode: string;
        verificationUri: string;
        expiresIn: number;
        interval: number;
      }>('device/start');
      setApparaatGegevens(uit);
      setApparaatOpen(true);
    } catch (e) {
      setFout(ghFoutTekst(e, tr));
    } finally {
      setApparaatBezig(false);
    }
  };

  const kopieerCode = () => {
    if (!apparaatGegevens?.userCode) return;
    void navigator.clipboard?.writeText(apparaatGegevens.userCode).then(() => {
      setGekopieerd(true);
      window.setTimeout(() => setGekopieerd(false), 1800);
    }).catch(() => undefined);
  };

  const modusUitleg = eenklik?.modus === 'manifest'
    ? tr(
        'На цьому сервері ще не було зареєстрованого мосту — натискання автоматично підготує власний ізольований застосунок GitHub для вашого домену та відкриє сторінку одного підтвердження без ручного копіювання ключів.',
        'Op deze server stond nog geen geregistreerde brug — één klik maakt automatisch een geïsoleerde GitHub App voor uw domein aan en opent het bevestigingsscherm zonder handmatig sleutels te kopiëren.',
      )
    : tr(
        'Відкриється офіційне вікно підтвердження доступу на GitHub. Жодних особистих ключів вручну створювати чи вставляти не потрібно.',
        'Opent direct het officiële bevestigingsscherm op GitHub. U hoeft nergens zelf een sleutel aan te maken of te plakken.',
      );

  return (
    <section className="gh-card gh-eenklik-held" aria-label={tr('Швидке підключення GitHub', 'Snel koppelen met GitHub')}>
      <div className="gh-eenklik-kop">
        <span className="gh-eenklik-tegel" aria-hidden="true">
          <Github size={26} />
        </span>
        <div className="gh-eenklik-tekst">
          <div className="gh-eenklik-rij">
            <h3>{gekoppeld ? tr('Ізольований міст GitHub активний', 'Geïsoleerde GitHub-brug is actief') : tr('Підключення GitHub в 1 натиск', 'GitHub in 1 klik koppelen')}</h3>
            {gekoppeld && login ? (
              <span className="gh-staat tone-ok">
                <CheckCircle2 size={14} /> @{login}
              </span>
            ) : (
              <span className="gh-chip">
                <Sparkles size={12} /> {tr('Без ручних ключів', 'Zonder handmatige sleutels')}
              </span>
            )}
          </div>
          <p className="gh-sub">{modusUitleg}</p>
        </div>
      </div>

      <div className="gh-eenklik-pijlers">
        <div className="gh-pijler">
          <ShieldCheck size={16} className="gh-ok" />
          <div>
            <strong>{tr('Ізольований простір', 'Geïsoleerde ruimte')}</strong>
            <span className="gh-sub">{tr('Кожен обліковий запис і технічний контур має власне шифроване сховище й окреме дзеркало.', 'Elk account en technisch profiel heeft een eigen versleutelde kluis en eigen spiegel.')}</span>
          </div>
        </div>
        <div className="gh-pijler">
          <Laptop size={16} className="gh-ok" />
          <div>
            <strong>{tr('Синхронізація та пристрої', 'Synchronisatie en apparaten')}</strong>
            <span className="gh-sub">{tr('Дії на сайті миттєво виконуються на GitHub і навпаки, разом із ШІ та підключеними комп’ютерами.', 'Handelingen op de site en op GitHub lopen één-op-één gelijk, inclusief AI en verbonden computers.')}</span>
          </div>
        </div>
      </div>

      {fout ? <GhMelding soort="error">{fout}</GhMelding> : null}

      <div className="gh-actions">
        <button type="button" className="gh-btn gh-primary gh-btn-groot" disabled={bezig} onClick={() => void startEenklik()}>
          {bezig ? <Loader2 size={16} className="gh-spin" /> : <Github size={16} />}
          {gekoppeld
            ? tr('Перепідключити GitHub в 1 натиск', 'GitHub in 1 klik opnieuw koppelen')
            : tr('Підключити GitHub в 1 натиск', 'GitHub in 1 klik koppelen')}
        </button>

        {(eenklik?.apparaatCodeKlaar || gekoppeld) ? (
          <button type="button" className="gh-btn" disabled={apparaatBezig || bezig} onClick={() => void startApparaatCode()}>
            {apparaatBezig ? <Loader2 size={15} className="gh-spin" /> : <Smartphone size={15} />}
            {tr('Увійти за кодом пристрою', 'Aanmelden met apparaatcode')}
          </button>
        ) : null}
      </div>

      <GhDialoog
        open={apparaatOpen}
        titel={tr('Підтвердження входу за кодом пристрою', 'Aanmelding bevestigen met apparaatcode')}
        onSluit={() => setApparaatOpen(false)}
        tr={tr}
      >
        {apparaatGegevens ? (
          <div className="gh-apparaatcode-doos">
            <p className="gh-sub">
              {tr(
                'Скопіюйте цей одноразовий код і введіть його на сторінці підтвердження GitHub (на цьому комп’ютері або зі смартфона). Щойно ви натиснете «Дозволити», сторінка підключиться автоматично.',
                'Kopieer deze eenmalige code en vul hem in op de bevestigingspagina van GitHub (op deze computer of op uw telefoon). Zodra u bevestigt, wordt de koppeling automatisch voltooid.',
              )}
            </p>
            <div className="gh-apparaatcode-waarde">
              <code>{apparaatGegevens.userCode}</code>
              <button type="button" className="gh-btn" onClick={kopieerCode}>
                {gekopieerd ? <Check size={15} /> : <Copy size={15} />}
                {gekopieerd ? tr('Скопійовано', 'Gekopieerd') : tr('Копіювати код', 'Code kopiëren')}
              </button>
            </div>
            <div className="gh-actions">
              <a
                className="gh-btn gh-primary"
                href={apparaatGegevens.verificationUri}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} />
                {tr('Відкрити сторінку підтвердження GitHub', 'Bevestigingspagina van GitHub openen')}
              </a>
            </div>
            <p className="gh-busy">
              <Loader2 size={15} className="gh-spin" />
              <span>{tr('Очікуємо підтвердження з GitHub…', 'Wachten op bevestiging van GitHub…')}</span>
            </p>
          </div>
        ) : null}
      </GhDialoog>
    </section>
  );
}
