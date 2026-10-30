// Klein los moduul: het accountmenu opent «Щось не працює?» zonder de hele diagnose in de hoofdbundel te trekken.
export const openDiagnose = () => window.dispatchEvent(new CustomEvent('mr-diagnose-venster'));
