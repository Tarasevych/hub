// Модульний тест (17.11.2026): виправлення перемикання акаунтів, технічного простору та сповіщень біля меню.
// Перевіряє живу поведінку сигналів простору, модель стану з lastKey та незмінні вимоги компонентів меню й сповіщень.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  RUIMTE_GEBRUIKER_WISSEL_GEBEURTENIS,
  RUIMTE_WISSEL_GEBEURTENIS,
  meldGebruikerWissel,
  meldRuimte,
  opGebruikerWissel,
} from '../../src/tech/ruimtes/ruimte-signaal';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('ruimtes-wissel-meldingen-20261117');

  // ---------------------------------------------------------------- 1. Сигнал явного перемикання простору (tech-ruimtes-v2)
  {
    const luisteraars = new Map<string, Set<(ev: any) => void>>();
    (globalThis as any).CustomEvent ??= class {
      type: string;
      detail: unknown;
      constructor(t: string, o: any) { this.type = t; this.detail = o?.detail; }
    };
    (globalThis as any).window = {
      addEventListener: (t: string, f: (ev: any) => void) => {
        if (!luisteraars.has(t)) luisteraars.set(t, new Set());
        luisteraars.get(t)!.add(f);
      },
      removeEventListener: (t: string, f: (ev: any) => void) => {
        luisteraars.get(t)?.delete(f);
      },
      dispatchEvent: (ev: any) => {
        for (const f of luisteraars.get(ev.type) || []) f(ev);
        return true;
      },
    };
    (globalThis as any).document = { documentElement: { dataset: {} as Record<string, string> } };

    const ontvangen: string[] = [];
    const ruimtesEvents: any[] = [];
    luisteraars.set(RUIMTE_WISSEL_GEBEURTENIS, new Set([(ev) => ruimtesEvents.push(ev.detail)]));
    const stop = opGebruikerWissel((naar) => ontvangen.push(naar));
    meldGebruikerWissel('technisch');
    meldGebruikerWissel('prive');
    stop();
    meldGebruikerWissel('technisch');

    check(
      'opGebruikerWissel доставляє переходи в технічний і приватний простори до відписки',
      ontvangen.length === 2 && ontvangen[0] === 'technisch' && ontvangen[1] === 'prive',
      JSON.stringify(ontvangen),
    );
    check(
      'RUIMTE_GEBRUIKER_WISSEL_GEBEURTENIS не втручається у RUIMTE_WISSEL_GEBEURTENIS',
      RUIMTE_GEBRUIKER_WISSEL_GEBEURTENIS !== RUIMTE_WISSEL_GEBEURTENIS && ruimtesEvents.length === 0,
    );

    meldRuimte('technisch');
    meldRuimte('prive');
    check(
      'meldRuimte і далі надсилає стандартну подію зміни простору',
      ruimtesEvents.length === 2 && ruimtesEvents[0].naar === 'technisch' && ruimtesEvents[1].naar === 'prive',
    );

    delete (globalThis as any).window;
    delete (globalThis as any).document;
  }

  // ---------------------------------------------------------------- 2. Перемикання між акаунтами (A → B → A + помилки меню + вкладка)
  {
    const stabiel = lees('src/useStabielWeergaveModel.ts');
    check(
      'useStableViewModel відстежує lastKey у hydrate, commit, remember та reset для повернення A → B → A',
      stabiel.includes('lastKey=useRef(\'\')')
        && stabiel.includes('lastKey.current!==entry.key||applied.current.get(entry.key)!==entry.signature')
        && stabiel.includes('force||lastKey.current!==result.entry.key||seen!==result.entry.signature')
        && stabiel.includes('if(lastKey.current===key)lastKey.current=\'\''),
    );

    const backend = lees('backend/index.ts');
    check(
      'POST /api/owner/session/replace-tab-remembered передає tab у ownerPayload',
      backend.includes('ownerPayload(session,user,overlay,tab)')
        && backend.includes('ownerPayload(activated.session,user,activated.overlay,tab)'),
    );

    const hubAuth = lees('src/useCanoniekHubAuth.ts');
    check(
      'useCanonicalHubAuth.connect приймає hintGrantId і повертає Promise<ConnectResult> із текстом помилок',
      hubAuth.includes('export type ConnectResult={ok:boolean;foutUk?:string;foutNl?:string};')
        && hubAuth.includes("const connect=async(intent:Intent='replace-tab',hintGrantId?:string):Promise<ConnectResult>=>")
        && hubAuth.includes('return{ok:true};')
        && hubAuth.includes('return{ok:false,foutUk,foutNl};'),
    );

    for (const [naam, pad] of [['App.tsx', 'src/App.tsx'], ['VerenigdDienstApp.tsx', 'src/VerenigdDienstApp.tsx']] as const) {
      const bron = lees(pad);
      check(
        `${naam}: оновлює простори через ruimtesVernieuwen, обробляє silentAllowed === false й повертає { fout, reauth }`,
        bron.includes('ruimtesVernieuwen')
          && bron.includes('hint?.silentAllowed===false')
          && bron.includes('return{ok:false as const,redirected:true}')
          && bron.includes('OWNER_REMEMBERED_REAUTH_REQUIRED')
          && bron.includes('OWNER_REPLACE_TAB_ANCHOR_REQUIRED')
          && bron.includes('return{techBeeindigd:Number(response.data?.techBeeindigd||0)}')
          && bron.includes('reauth:!leesActieveAanmeldPauze().actief}')
          && bron.includes(',reauth}'),
      );
    }

    const menu = lees('src/CanoniekAccountMenu.tsx');
    const v3 = lees('src/accountmenu-v3/AccountMenuV3.tsx');
    check(
      'CanoniekAccountMenu й AccountMenuV3 показують помилку wisselFout і кнопку повторного входу замість фальшивого успіху',
      menu.includes('setWisselFout')
        && menu.includes('if (res.redirected) { sluitMetLade(); return; }')
        && menu.includes('if (res && res.ok === false)')
        && menu.includes('wisselFout.reauth')
        && menu.includes("data-account-wissel-fout='true'")
        && (menu.match(/data-account-wissel-fout='true'/g) || []).length >= 2
        && v3.includes("data-account-wissel-fout='true'")
        && v3.includes('am3-wissel-fout'),
    );
  }

  // ---------------------------------------------------------------- 3. Перемикання на технічний простір і видима реакція
  {
    const opslag = lees('src/tech/ruimtes/ruimtes-opslag.ts');
    const techLaag = lees('src/tech/TechLaag.tsx');
    const zijbalk = lees('src/tech/ruimtes/ZijbalkRuimte.tsx');
    const wissel = lees('src/tech/ruimtes/RuimteWissel.tsx');

    check(
      'ruimtes-opslag підписано на CANONICAL_AUTH_CHANGE і викликає meldGebruikerWissel при успішному перемиканні',
      opslag.includes('CANONICAL_AUTH_CHANGE') && opslag.includes('meldGebruikerWissel(naar)'),
    );
    check(
      'TechLaag відкриває технічну панель через opGebruikerWissel / openBijBandAan і зберігає підключення koppelInschuiven',
      techLaag.includes('opGebruikerWissel')
        && techLaag.includes('openBijBandAan')
        && /koppelInschuiven\(\{ band: \(\) => bandRef\.current/.test(techLaag),
    );
    check(
      'ZijbalkRuimte і RuimteWissel дають зворотний зв’язок та швидкий перехід до Адміністрування у технічному просторі',
      zijbalk.includes('emitCanonicalNotice')
        && zijbalk.includes('zr-admin-link')
        && wissel.includes('rw-admin-link')
        && !lees('src/tech/ruimtes/ruimtes.css').includes('.rw-seg'),
    );
  }

  // ---------------------------------------------------------------- 4. Сповіщення при головному меню (.menu-bellen)
  {
    const omlijsting = lees('src/CanoniekOmlijsting.tsx');
    const bellen = lees('src/MenuMeldingen.tsx');
    const css = lees('src/menu-v2.css');

    check(
      'CanoniekOmlijsting утримує курсор над .menu-bellen і не згортає меню при кліку всередині сповіщень або порталу облікових записів',
      omlijsting.includes("'.menu-acties,.menu-bewerkbalk,.dock-paneel,.menu-bellen,[class*=\"canonical-notification\"],.plaats-actiestapel,.plaats-acties,.am3-mobiel-laag,.canonical-account-portal'")
        && omlijsting.includes('belPaneel.current?.getBoundingClientRect()')
        && omlijsting.includes('belBinnen.current')
        && omlijsting.includes('kant={tipKant}')
        && omlijsting.includes('window.clearTimeout(belTimers.current.open);window.clearTimeout(belTimers.current.dicht);clearCloseTimer()')
        && omlijsting.includes('leaveTransient()'),
    );
    check(
      'MeldingBellen підтримує опційний kant, перерахунок від живого ankerEl і не закривається від blur після видалення елемента',
      bellen.includes("kant?:'left'|'right'")
        && bellen.includes('data-kant={kant}')
        && bellen.includes('ankerEl?.isConnected?ankerEl.getBoundingClientRect():anker')
        && bellen.includes('if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node))onBinnen(false)')
        && bellen.includes('if(e.relatedTarget instanceof Node&&e.currentTarget.contains(e.relatedTarget))return;onBinnen(false)'),
    );
    check(
      'menu-v2.css містить невидимий місток ::before і прокручує лише ul за overflow:visible на .menu-bellen',
      css.includes('.menu-bellen{')
        && css.includes('overflow:visible')
        && css.includes('.menu-bellen::before{')
        && css.includes(".menu-bellen[data-kant='left']::before{")
        && css.includes('.menu-bellen ul{')
        && css.includes('overflow-y:auto'),
    );
  }

  return einde();
}
