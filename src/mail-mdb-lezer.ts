// mdb-reader met de Node-shim ervoor (zie src/platform/node-shim.ts): de import-volgorde is de uitvoervolgorde — eerst de shim, dan de bibliotheek.
import './platform/node-shim';
export { default } from 'mdb-reader';
