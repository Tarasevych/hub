// Віджет «GitHub» на робочому столі (hub.*/overzicht, v2 та v3).
// Читає безпечне зведення POST /api/owner/hub/werkblad/github для поточного простору (prive / technisch) без жодних маркерів доступу.
// Знак GitHub береться виключно з єдиного реєстру марок (REESTR-LOGO-001: <Merk merk='github' />).
import { ArrowRight, GitBranch, Lock } from 'lucide-react';
import Merk from '../../merk/Merk';
import { haalGithubSamenvatting, useBron, type GithubSamenvatting } from '../gegevens';
import { geleden, regelsVoor, tr, type Lang, type WidgetProps } from '../soorten';
import { Fout, Leeg, Skelet } from './Vlak';

function actieOmschrijving(actie: string, lang: Lang): string {
  if (actie.includes('koppeling') || actie.includes('koppel')) {
    return tr(lang, 'Оновлено підключення GitHub', 'GitHub-koppeling bijgewerkt');
  }
  if (actie.includes('spiegel') || actie.includes('sync')) {
    return tr(lang, 'Звірка дзеркала сховища', 'Spiegelcontrole van opslagplaats');
  }
  if (actie.includes('uitgave') || actie.includes('release')) {
    return tr(lang, 'Дія з випуском', 'Uitgavehandeling');
  }
  return actie.replace(/^owner\.github\./, '');
}

export default function GitHubWidget({ lang, item, acties, zichtbaar, kolommen }: WidgetProps) {
  const { waarde, fout, bezig, herlaad } = useBron<GithubSamenvatting>((f) => haalGithubSamenvatting(f), null, zichtbaar);
  if (fout) return <Fout lang={lang} code={fout} opnieuw={herlaad} />;
  if (!waarde) return bezig || !zichtbaar ? <Skelet rijen={3} /> : <Fout lang={lang} code='GEEN_BRON' opnieuw={herlaad} />;

  if (waarde.kluisGesloten) {
    return (
      <div className='wb-lijst-vlak' data-wb-github='kluis-gesloten'>
        <Leeg icoon={<Lock aria-hidden='true' />}>
          {tr(
            lang,
            'Сховище ключів цього простору зачинене. Відімкніть його, щоб побачити підключені профілі GitHub.',
            'De sleutelkluis van deze ruimte is gesloten. Ontgrendel haar om gekoppelde GitHub-profielen te bekijken.',
          )}
        </Leeg>
        <button type='button' className='wb-alles' onClick={() => acties.dienst('identity', 'methods')}>
          {tr(lang, 'Відімкнути сховище ключів', 'Sleutelkluis ontgrendelen')}
          <ArrowRight aria-hidden='true' />
        </button>
      </div>
    );
  }

  if (!waarde.gekoppeld) {
    return (
      <div className='wb-lijst-vlak' data-wb-github='niet-gekoppeld'>
        <Leeg icoon={<Merk merk='github' naam='GitHub' vorm='gliefje' maat={22} />}>
          {tr(
            lang,
            'У цьому просторі ще не підключено обліковий профіль GitHub.',
            'In deze ruimte is nog geen GitHub-profiel gekoppeld.',
          )}
        </Leeg>
        <button type='button' className='knop-secundair is-klein' onClick={() => acties.dienst('github', 'accounts')}>
          <Merk merk='github' naam='GitHub' vorm='gliefje' maat={16} />
          {tr(lang, 'Підключити GitHub', 'GitHub koppelen')}
        </button>
      </div>
    );
  }

  const maxRijen = regelsVoor(item.r, kolommen, 2, 2);
  const totaalRepos = waarde.opslagplaatsen.length || waarde.accounts.reduce((s, a) => s + a.repoAantal, 0);

  return (
    <div className='wb-lijst-vlak' data-wb-github='gekoppeld'>
      <div className='wb-tellers'>
        <span>
          <strong>{waarde.accounts.length}</strong>
          <small>{tr(lang, 'профілів', 'profielen')}</small>
        </span>
        <span>
          <strong>{totaalRepos}</strong>
          <small>{tr(lang, 'сховищ', 'opslagplaatsen')}</small>
        </span>
      </div>
      <ul className='wb-rijen'>
        {waarde.accounts.slice(0, 2).map((acc) => (
          <li key={`${acc.pad}:${acc.login}`}>
            <Merk merk='github' naam='GitHub' vorm='gliefje' maat={16} />
            <span className='wb-rij-titel'>{acc.login ? `@${acc.login}` : acc.pad.toUpperCase()}</span>
            <span className='pil pil-ok'>{acc.pad === 'app' ? 'GitHub App' : 'OAuth'}</span>
          </li>
        ))}
        {waarde.opslagplaatsen.slice(0, Math.max(1, maxRijen - waarde.accounts.slice(0, 2).length)).map((repo) => (
          <li key={repo}>
            <GitBranch aria-hidden='true' />
            <span className='wb-rij-titel'>{repo}</span>
          </li>
        ))}
        {!waarde.opslagplaatsen.length &&
          waarde.recenteActies.slice(0, 2).map((act) => (
            <li key={act.id}>
              <span className='wb-rij-titel'>{actieOmschrijving(act.actie, lang)}</span>
              {act.op ? <small>{geleden(lang, act.op)}</small> : null}
            </li>
          ))}
      </ul>
      <div className='wb-rij-knoppen'>
        <button type='button' className='wb-alles' onClick={() => acties.dienst('github', 'overview')}>
          {tr(lang, 'До GitHub', 'Naar GitHub')}
          <ArrowRight aria-hidden='true' />
        </button>
        <button type='button' className='knop-stil is-klein' onClick={() => acties.dienst('github', 'repositories')}>
          {tr(lang, 'Сховища', 'Opslagplaatsen')}
        </button>
      </div>
    </div>
  );
}
