// Tabbladpictogram met een gekleurd hoekje in de technische ruimte (naast «[ТЕХ]» in de titel): zichtbaar tussen veel tabbladen.
// Gewone ruimte: de oorspronkelijke pictogrammen terug. Nooit netwerk: tekent het bestaande pictogram op een canvas.
const ORIG = 'mrOrigHref';
export function zetTabbladMerk(aan: boolean, kleur = '#7c3aed'): void {
  if (typeof document === 'undefined') return;
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  if (!aan) { links.forEach((l) => { const o = l.dataset[ORIG]; if (o) { l.href = o; delete l.dataset[ORIG]; } }); delete document.documentElement.dataset.ruimtePictogram; return; }
  if (!links.length) return;
  const bron = links.find((l) => /png/.test(l.type)) || links[0];
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = 32; c.height = 32;
      const g = c.getContext('2d'); if (!g) return;
      g.drawImage(img, 0, 0, 32, 32);
      g.fillStyle = kleur; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.rect(15, 15, 16, 16); g.fill(); g.stroke();
      const url = c.toDataURL('image/png');
      links.forEach((l) => { if (!l.dataset[ORIG]) l.dataset[ORIG] = l.getAttribute('href') || ''; l.href = url; });
      document.documentElement.dataset.ruimtePictogram = 'technisch';
    } catch { /* canvas geblokkeerd: titel «[ТЕХ]» blijft de aanwijzing */ }
  };
  img.src = bron.dataset[ORIG] || bron.href;
}
