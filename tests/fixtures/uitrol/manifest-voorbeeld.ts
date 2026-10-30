// Geldig UITROL-MANIFEST.json (schema 1) voor tests — UI-010.
export const manifestVoor = (versie: string, over: Record<string, unknown> = {}) => JSON.stringify({
  schema: 1, versie, aangemaakt: '2026-10-29T19:00:00+01:00', herkomst: 'git: integratie@ba499d9 (basis 20261029-193103)', auteur: 'Eigenaar Test', zonderAi: false,
  deelnemers: [
    { soort: 'mens', naam: 'Eigenaar Test', rollen: ['auteur', 'controle'] },
    { soort: 'ai', naam: 'grok', platform: 'Grok Bot', tool: 'Grok Bot executor', model: { id: null, versie: null, bron: 'onbekend' }, rollen: ['ontwikkeling', 'testen', 'verpakken'] },
    { soort: 'ai', naam: 'claude', platform: 'Claude Code', tool: 'CLI', model: { id: 'claude-opus-4-1-20250805', versie: '20250805', bron: 'auteur' }, rollen: ['controle'] },
  ],
  beschrijving: {
    uk: { titel: 'Хмара нового покоління', samenvatting: 'Нова сторінка хмарного сховища з підключеннями та історією.', wijzigingen: ['Нова сторінка'], fixes: [], beperkingen: ['Не перевірено на iOS'], instructies: '' },
    nl: { titel: 'Cloud vNext', samenvatting: 'Nieuwe pagina voor cloudopslag met verbindingen en geschiedenis.', wijzigingen: ['Nieuwe pagina'], fixes: [], beperkingen: ['Niet getest op iOS'], instructies: '' },
  },
  ...over,
});
