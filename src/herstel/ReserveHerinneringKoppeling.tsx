// IDENTITEIT-015 (sleutels-gasten): прив'язка перемикача «Нагадувати про резервний доступ» до сховища вподобань меню (той самий
// стан, що в Меню → «Сповіщення в меню»; зберігається в обліковому записі через /api/owner/ui/sidebar/save). Лінивий модуль.
import { useZijbalkVoorkeuren, zetZijbalk } from '../zijbalk-voorkeuren';
import { ReserveHerinneringWeergave } from './ReserveHerinnering';

export default function ReserveHerinneringKoppeling({ lang }: { lang: 'uk' | 'nl' }) {
  const v = useZijbalkVoorkeuren();
  return <ReserveHerinneringWeergave lang={lang} aan={v.meldingen.reserveHerinnering !== false}
    onZet={(x) => zetZijbalk((cur) => ({ ...cur, meldingen: { ...cur.meldingen, reserveHerinnering: x } }))} />;
}
