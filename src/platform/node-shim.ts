// Minimale Node-globals voor browserbibliotheken die ze bij het LADEN lezen (23.10.2026, gevonden door de rendercontrole van zone A).
// mdb-reader (voorbeeld van .mdb/.accdb-bijlagen) trekt browserify-aes/create-hash → readable-stream mee; die lezen `process` (nextTick,
// env) en `Buffer` meteen bij het laden. Deze module wordt als EERSTE import van src/mail-mdb-lezer.ts geladen, zodat ook de losse chunk
// zelfstandig laadt (de rendercontrole importeert elke chunk afzonderlijk). Nooit iets overschrijven wat er al is.
import { Buffer } from 'buffer';

const g = globalThis as unknown as { process?: unknown; Buffer?: unknown };
if (!g.Buffer) g.Buffer = Buffer;
if (!g.process) g.process = { env: {}, browser: true, version: '', versions: {}, argv: [], cwd: () => '/', nextTick: (fn: (...a: unknown[]) => void, ...a: unknown[]) => queueMicrotask(() => fn(...a)) };

export {};
