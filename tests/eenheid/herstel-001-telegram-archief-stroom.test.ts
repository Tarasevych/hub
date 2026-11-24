// Перевірка потокового архівування випуску в Telegram без буферизації частин у Buffer/Blob (HERSTEL-001, 24.11.2026).
// Test van gestreamde Telegram-archivering zonder volledige deelbuffers in geheugen (HERSTEL-001, 24.11.2026).
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  setUitrolTelegramDeps,
  sha256Deel,
  stuurDocumentVanBestand,
} from '../../backend/uitrol-telegram';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => {
  resultaten.push({ naam, ok });
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`);
};

export async function main(): Promise<number> {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'mr-tg-stroom-'));
  try {
    // 1. Тестовий файл 48 МБ (як реальний пакунок випуску), записаний потоково по 1 МБ
    const grootPad = path.join(tmpDir, 'enc-48mb.bin');
    const blok = randomBytes(1024 * 1024);
    const totaalMb = 48;
    const deelMb = 16;
    const ws = createWriteStream(grootPad);
    for (let i = 0; i < totaalMb; i++) {
      // Змінюємо перший байт кожного мегабайта, щоб частини мали різні SHA-256
      blok[0] = i & 0xff;
      if (!ws.write(Buffer.from(blok))) {
        await new Promise<void>((resolve) => ws.once('drain', resolve));
      }
    }
    await new Promise<void>((resolve, reject) => {
      ws.end(() => resolve());
      ws.once('error', reject);
    });

    // 2. Потокове надсилання 3 частин по 16 МБ (загалом 48 МБ) + перевірка повтору після 502 та вимір пам'яті
    let pogingTeller = 0;
    let maxExtDeltaMb = 0;
    let maxAbDeltaMb = 0;
    const startMem = process.memoryUsage();
    const ontvangenLengtes: number[] = [];
    const ontvangenHeaders: Array<{ ct: string; cl: number; duplex?: string }> = [];
    let multipartGeldig = true;

    const meet = () => {
      const m = process.memoryUsage();
      const extDelta = (m.external - startMem.external) / (1024 * 1024);
      const abDelta = (m.arrayBuffers - startMem.arrayBuffers) / (1024 * 1024);
      if (extDelta > maxExtDeltaMb) maxExtDeltaMb = extDelta;
      if (abDelta > maxAbDeltaMb) maxAbDeltaMb = abDelta;
    };

    const stroomFetch: typeof fetch = async (_input, init) => {
      pogingTeller += 1;
      const headers = new Headers(init?.headers);
      const ct = headers.get('content-type') || '';
      const cl = Number(headers.get('content-length') || '0');
      ontvangenHeaders.push({ ct, cl, duplex: (init as { duplex?: string } | undefined)?.duplex });

      // Потоково зчитуємо тіло (імітація мережевого сокета без збереження в RAM) і звіряємо точний Content-Length
      let gelezen = 0;
      let eersteKader = '';
      let laatsteKader = '';
      const body = init?.body as ReadableStream<Uint8Array>;
      const reader = body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (eersteKader.length < 2048) {
          eersteKader += Buffer.from(value.subarray(0, Math.min(value.length, 2048))).toString('utf8');
        }
        laatsteKader = Buffer.from(value.subarray(Math.max(0, value.length - 128))).toString('utf8');
        gelezen += value.byteLength;
        meet();
      }

      if (gelezen !== cl || !ct.startsWith('multipart/form-data; boundary=----MijnRuimteTg')) {
        multipartGeldig = false;
      }
      if (!eersteKader.includes('name="chat_id"') || !eersteKader.includes('name="document"') || !laatsteKader.includes('--\r\n')) {
        multipartGeldig = false;
      }

      // На першій спробі імітуємо тимчасовий 502, щоб перевірити перестворення свіжого потоку при повторі
      if (pogingTeller === 1) {
        return new Response(JSON.stringify({ ok: false, error_code: 502 }), { status: 502 });
      }
      ontvangenLengtes.push(gelezen);
      return new Response(JSON.stringify({
        ok: true,
        result: {
          message_id: 500 + pogingTeller,
          document: { file_id: `fid-${pogingTeller}`, file_unique_id: `uid-${pogingTeller}` },
        },
      }), { status: 200 });
    };

    setUitrolTelegramDeps({ fetch: stroomFetch, slaap: async () => undefined });
    try {
      const deelBytes = deelMb * 1024 * 1024;
      const shas: string[] = [];
      for (let i = 0; i < 3; i++) {
        const start = i * deelBytes;
        const end = start + deelBytes - 1;
        const info = await sha256Deel(grootPad, start, end);
        shas.push(info.sha256);
        const res = await stuurDocumentVanBestand(
          '123456:ABCdefGHIjklMNOpqrSTUvwxyz12345',
          '-100999888',
          42,
          `mijn-ruimte-20261124-210000.tar.gz.enc.part00${i + 1}of003`,
          grootPad,
          start,
          end,
          info.bytes,
          `Mijn Ruimte частина ${i + 1}/3`,
        );
        meet();
        if (!res.messageId || !res.fileId) multipartGeldig = false;
      }
      check('48 МБ (3 × 16 МБ) надіслано потоково з точним Content-Length, RFC 7578 multipart і повтором після 502',
        multipartGeldig && pogingTeller === 4 && ontvangenLengtes.length === 3 && new Set(shas).size === 3,
        `спроб=${pogingTeller}, частин=${ontvangenLengtes.length}`);
      check('кожний виклик передає duplex="half" і заголовок multipart/form-data',
        ontvangenHeaders.every((h) => h.duplex === 'half' && h.cl > deelBytes && h.ct.startsWith('multipart/form-data; boundary=')));
      check('позакупова пам’ять під час 48 МБ потокової передачі не роздувається (external/arrayBuffers < 32 МБ замість +335 МБ)',
        maxExtDeltaMb < 32 && maxAbDeltaMb < 32,
        `maxExtDelta=${maxExtDeltaMb.toFixed(1)} МБ, maxAbDelta=${maxAbDeltaMb.toFixed(1)} МБ`);

      // 3. Точний RFC 7578 розбір через стандартний Response.formData() на невеликому зрізі
      const kleinPad = path.join(tmpDir, 'klein.bin');
      const kleinBytes = randomBytes(128 * 1024 + 37);
      const wsK = createWriteStream(kleinPad);
      wsK.end(kleinBytes);
      await new Promise<void>((r) => wsK.once('finish', r));
      let parsedOk = false;
      setUitrolTelegramDeps({
        fetch: async (_input, init) => {
          const fd = await new Response(init?.body as BodyInit, { headers: init?.headers }).formData();
          const f = fd.get('document') as File;
          const got = Buffer.from(await f.arrayBuffer());
          parsedOk = String(fd.get('chat_id')) === '-100123456'
            && String(fd.get('message_thread_id')) === '77'
            && String(fd.get('disable_notification')) === 'true'
            && f.name === 'deel.enc'
            && createHash('sha256').update(got).digest('hex') === createHash('sha256').update(kleinBytes).digest('hex');
          return new Response(JSON.stringify({ ok: true, result: { message_id: 777, document: { file_id: 'f7', file_unique_id: 'u7' } } }), { status: 200 });
        },
        slaap: async () => undefined,
      });
      await stuurDocumentVanBestand('123456:ABCdefGHIjklMNOpqrSTUvwxyz12345', '-100123456', 77, 'deel.enc', kleinPad, 0, kleinBytes.length - 1, kleinBytes.length, 'Перевірка');
      check('стандартний парсер Response.formData() відтворює 1:1 усі поля й побайтовий SHA-256 документа', parsedOk);
    } finally {
      setUitrolTelegramDeps(null);
    }

    // 4. Статичні гарантії в backend/uitrol-telegram.ts та мовна чистота
    const bron = readFileSync('backend/uitrol-telegram.ts', 'utf8');
    check('у backend/uitrol-telegram.ts прибрано leesDeelBytes і зменшено STANDAARD_DEEL_BYTES до <= 15 МБ',
      !bron.includes('function leesDeelBytes') && bron.includes('STANDAARD_DEEL_BYTES = 15 * 1024 * 1024'));
    check('наявні глобальна черга, ruimOudeTgTmpEnBezigOp та прив’язка controleerTelegramBlokkade до releaseInfo().versie',
      bron.includes('archiefBezigGlobaal') && bron.includes('ruimOudeTgTmpEnBezigOp') && bron.includes('const actiefVersie = String(releaseInfo().versie'));
    check('мовна чистота backend/uitrol-telegram.ts без заборонених літер', !/[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/.test(bron));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const mis = resultaten.filter((r) => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (herstel-001-telegram-archief-stroom)`);
  return mis ? 1 : 0;
}
