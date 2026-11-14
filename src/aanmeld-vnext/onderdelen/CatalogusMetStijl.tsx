// IDENTITEIT-014: каталог «Інші способи входу» для старої панелі способів входу — той самий компонент, що й у vNext, разом зі
// своїми стилями (класи amv-* живуть у aanmeld-vnext.css; усі правила там обмежені префіксом amv, тож панель вони не чіпають).
// Завантажується ліниво, щоб стара панель не тягнула стилі й код каталогу, поки розділ «Вхід» не відкрито.
// Catalogus van andere aanmeldmethoden voor het oude paneel: hetzelfde onderdeel als in vNext, met zijn eigen stijlen (lui geladen).
import '../aanmeld-vnext.css';
export { default } from './AanbiederCatalogus';
