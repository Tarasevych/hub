// SEC-002 (privacy-logboek-02 en -06, 12.11.2026): tekst en JSON die PostgreSQL altijd aanneemt.
//
// Waarom: jsonb weigert twee dingen die in gewone JavaScript-strings wél kunnen staan:
//   1. U+0000 («unsupported Unicode escape sequence»);
//   2. een eenzame surrogaat — de helft van een emoji die overblijft na `tekst.slice(0, n)`, of «\ud83d» die een
//      aanroeper rechtstreeks in JSON meestuurt («invalid input syntax for type json»).
// Eén zo'n teken in details liet de hele INSERT mislukken; de fout werd op veel plekken opgegeten (audit mag de actie
// niet breken), dus de actie gebeurde ZONDER regel in het logboek. Deze helpers vervangen beide door U+FFFD — de regel
// komt er altijd, en aan «�» is te zien dat er iets onleesbaars stond.
//
// Bewust op de UITVOER van JSON.stringify en niet met een replacer: een replacer ziet alleen waarden, geen sleutels,
// en een sleutel uit een verzoek kan dezelfde tekens bevatten.

// SEC-002 (afwerking A): de functies staan nu in shared/tekst-veilig.ts (één plek voor server en browser); hier opnieuw geëxporteerd.
export { jsonbTekst, jsonbVeilig, knipTekst, knipVeilig, tekstVeilig } from '../../shared/tekst-veilig';
