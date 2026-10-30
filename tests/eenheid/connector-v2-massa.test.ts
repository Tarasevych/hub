// Massale wijziging van rechten («Пришвидшене керування»): één berekening voor browser en server; samenvatting = wat later wordt opgeslagen.
import { berekenMassa, basisVan, aantalMogelijk, vraagtSterkeBevestiging } from '../../shared/connector-v2/massa';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { STANDAARD, schoon } from '../../shared/connector-v2/rechten';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-v2-massa');
  const basis = basisVan(null, null);
  check('basis zonder keuze = veilige standaard, alleen privékant', basis.kanten.join() === 'gebruiker' && basis.sleutels.join() === STANDAARD().join());

  const lezen = berekenMassa(basis, { modus: 'lezen', kanten: ['gebruiker'], groep: 'mail' });
  const mailLezen = V2_OPTIES.filter((o) => o.status === 'actief' && o.kant === 'gebruiker' && o.groep === 'mail' && o.soort === 'lezen').map((o) => o.key);
  check('mail alleen lezen: alle mail-leesrechten aan, geen schrijfrechten van mail', mailLezen.every((k) => lezen.sleutels.includes(k)) && !lezen.sleutels.some((k) => V2_OPTIES.find((o) => o.key === k)?.groep === 'mail' && V2_OPTIES.find((o) => o.key === k)?.soort !== 'lezen'));
  check('andere groepen blijven ongemoeid bij een groepskeuze', STANDAARD().filter((k) => V2_OPTIES.find((o) => o.key === k)?.groep !== 'mail').every((k) => lezen.sleutels.includes(k)));

  const alles = berekenMassa(basis, { modus: 'alles', kanten: ['gebruiker'] });
  check('alle acties (privé): alle actieve privé-opties aan, uitbreiding, riskante en gevoelige rechten geteld', alles.totaal === aantalMogelijk(['gebruiker']) && alles.uitbreiding && alles.riskant > 0 && alles.gevoelig > 0 && alles.risico !== 'laag');
  check('«alle acties» of uitbreiding vraagt sterke bevestiging; inperken niet', vraagtSterkeBevestiging({ modus: 'alles', kanten: ['gebruiker'] }, [alles]) && !vraagtSterkeBevestiging({ modus: 'geen', kanten: ['gebruiker'] }, [berekenMassa(alles, { modus: 'geen', kanten: ['gebruiker'] })]));

  const geen = berekenMassa({ kanten: alles.kanten, sleutels: alles.sleutels }, { modus: 'geen', kanten: ['gebruiker'] });
  check('alles uit: niets over, geen uitbreiding, alles vervalt', geen.totaal === 0 && !geen.uitbreiding && geen.vervalt === alles.totaal && geen.gewijzigd);

  const beheer = berekenMassa(basis, { modus: 'lezen', kanten: ['gebruiker', 'beheer'] });
  check('beheerkant erbij: kanten uitgebreid en beheerrechten (lezen) toegevoegd', beheer.kanten.join() === 'beheer,gebruiker' && beheer.sleutels.some((k) => k.endsWith(':beheer')) && beheer.uitbreiding);
  const zonderBeheer = berekenMassa({ kanten: beheer.kanten, sleutels: beheer.sleutels }, { modus: 'geen', kanten: ['gebruiker'] });
  check('«geen» op privé laat de beheerkant en zijn rechten staan', zonderBeheer.kanten.join() === 'beheer,gebruiker' && zonderBeheer.sleutels.some((k) => k.endsWith(':beheer')) && !zonderBeheer.sleutels.some((k) => k.endsWith(':gebruiker')));

  const nogmaals = berekenMassa({ kanten: lezen.kanten, sleutels: lezen.sleutels }, { modus: 'lezen', kanten: ['gebruiker'], groep: 'mail' });
  check('zelfde wijziging twee keer = geen wijziging (idempotent)', !nogmaals.gewijzigd && nogmaals.toegevoegd === 0 && nogmaals.vervalt === 0);
  check('resultaat is altijd schoon (alleen bekende, actieve sleutels in de gekozen kanten)', schoon(alles.sleutels, alles.kanten).join() === alles.sleutels.join() && schoon(beheer.sleutels, beheer.kanten).join() === beheer.sleutels.join());
  return einde();
}
