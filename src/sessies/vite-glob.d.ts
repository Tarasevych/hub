// Alleen het stukje van Vite's ImportMeta dat de sessiepagina gebruikt (vlaggen lui laden), zonder heel vite/client in te trekken.
// Оголошення *.css потрібне для динамічного імпорту таблиць стилів (наприклад, maquette-stijlen.css) при перевірці типів.
interface ImportMeta { glob<T = unknown>(patroon: string, opties: { import: string }): Record<string, () => Promise<T>> }
declare module '*.css' {}
