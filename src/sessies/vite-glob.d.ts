// Alleen het stukje van Vite's ImportMeta dat de sessiepagina gebruikt (vlaggen lui laden), zonder heel vite/client in te trekken.
interface ImportMeta { glob<T = unknown>(patroon: string, opties: { import: string }): Record<string, () => Promise<T>> }
