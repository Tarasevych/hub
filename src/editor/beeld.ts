/** Вставка зображення з буфера або файлу. Більше за 4 МБ не кладемо в data-URL листа. */
export const BEELD_GRENS = 4 * 1024 * 1024;

export function beeldBestanden(list: ArrayLike<File> | null | undefined): File[] {
  const uit: File[] = [];
  if (!list) return uit;
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    if (file && file.type.startsWith('image/') && file.size > 0 && file.size <= BEELD_GRENS) uit.push(file);
  }
  return uit;
}

export function leesBeeldDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      if (src.startsWith('data:image/')) resolve(src);
      else reject(new Error('geen beeld'));
    };
    reader.onerror = () => reject(reader.error || new Error('leesfout'));
    reader.readAsDataURL(file);
  });
}

type PlakItem = { kind?: string; type?: string; getAsFile?: () => File | null };
type PlakLijst = { files?: ArrayLike<File> | null; items?: ArrayLike<PlakItem> | null } | null | undefined;

function bestandenUit(bron: PlakLijst): File[] {
  const rechtstreeks = beeldBestanden(bron?.files);
  if (rechtstreeks.length || !bron?.items) return rechtstreeks;
  const uit: File[] = [];
  for (let i = 0; i < bron.items.length; i++) {
    const item = bron.items[i];
    if (!item || item.kind === 'string') continue;
    if (item.type && !item.type.startsWith('image/')) continue;
    const file = item.getAsFile?.();
    if (file) uit.push(file);
  }
  return beeldBestanden(uit);
}

type PlakBron = {
  preventDefault?: () => void;
  clipboardData?: PlakLijst;
  dataTransfer?: PlakLijst;
};

/** true = зображення перехоплено. Інакше ProseMirror вставляє текст як раніше. */
export function plakBeeld(event: PlakBron, invoegen: (src: string, alt: string) => void): boolean {
  const uitKlembord = bestandenUit(event.clipboardData);
  const files = uitKlembord.length ? uitKlembord : bestandenUit(event.dataTransfer);
  if (!files.length) return false;
  event.preventDefault?.();
  for (const file of files) {
    void leesBeeldDataUrl(file).then((src) => invoegen(src, file.name || 'image')).catch(() => undefined);
  }
  return true;
}
