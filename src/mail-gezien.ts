// «Пам'ять стану» van de mappen in E-mail: een map die u hebt bekeken, toont geen teller meer tot er sindsdien MEER ongelezen
// zijn; dan «+N» (N = nieuw sinds het bezoek) naast de resterende ongelezen. De stand (`seenUnread`) staat in de
// weergavevoorkeuren op de server, dus hij geldt na F5, op een ander subdomein en op een ander toestel.
export function gezienStaat(seenUnread: number | undefined, ongelezen: number): { toon: boolean; nieuw: number } {
  const n = Math.max(0, Math.floor(Number(ongelezen) || 0));
  if (seenUnread === undefined || !Number.isFinite(seenUnread)) return { toon: n > 0, nieuw: 0 };
  return { toon: n > seenUnread, nieuw: Math.max(0, n - seenUnread) };
}
