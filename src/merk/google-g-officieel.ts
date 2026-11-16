// Het OFFICIËLE Google-«G» (vier kleuren) voor de aanmeldknop «Увійти через Google».
//
// REESTR-LOGO-001 (16.11.2026): dit bestand droeg tot nu toe een EIGEN kopie van het SVG (2,2 kB), naast dezelfde tekst in
// src/merk/officieel/google.svg, in de luie tabel en in «Макет». Nu is er één bron: het generator-bestand shared/merk-direct.ts
// (scripts/merk-officieel-maken.mjs), dat ook de luie tabel en de serverpagina's gebruiken. Hier staan alleen nog de namen die de
// aanmeldschil en de tests verwachten. Раніше тут була окрема копія знака Google; тепер — посилання на єдиний реєстр.
// Herkomst: @iconify-json/logos 1.2.17, icoon «google-icon» (gilbarbara/logos, CC0-1.0) — zie src/merk/officieel/HERKOMST.json.
// Merknaam en logo blijven eigendom van Google LLC; ze staan hier uitsluitend om de aanmeldweg te herkennen.
import { MERK_DIRECT, merkDirectDataUri } from '../../shared/merk-direct';

export const GOOGLE_G_SVG = MERK_DIRECT.google.inhoud;
// bron = «<pakket>@<versie> · <icoon> · <licentie>» (generator); hieruit, zodat een nieuwe pakketversie nergens met de hand hoeft.
const [pakketVersie = '', icoon = '', licentie = ''] = MERK_DIRECT.google.bron.split(' · ');
const at = pakketVersie.lastIndexOf('@');
export const GOOGLE_G_HERKOMST = { pakket: pakketVersie.slice(0, at), versie: pakketVersie.slice(at + 1), icoon, licentie, sha256: MERK_DIRECT.google.sha256 } as const;
export const GOOGLE_G_DATA_URI = merkDirectDataUri('google');
