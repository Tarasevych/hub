// Controle van het WebSocket-kanaal voor agents (geen token nodig, niets wordt gewijzigd).
//   node ws-check.mjs [wss://mcp.tarasevych.com/agent/ws]
// Verwacht: "open", en na ongeveer 5 s "close code=4401 reason=auth timeout" -> exit 0.
// Dat bewijst dat de upgrade (WSS) via de tunnel de hoofdapp bereikt en dat de app zonder token zelf sluit.
// Geen "open" -> de tunnelregel stuurt dit pad niet naar de hoofdapp (poort 8080) of de host is onbekend.
const url = process.argv[2] || 'wss://mcp.tarasevych.com/agent/ws';
const t0 = Date.now();
const ms = () => `${Date.now() - t0} ms`;
const ws = new WebSocket(url);
ws.onopen = () => console.log(`open na ${ms()}`);
ws.onerror = () => console.log(`fout na ${ms()} (handshake geweigerd of host onbereikbaar)`);
ws.onclose = (e) => {
  console.log(`close code=${e.code} reason="${e.reason}" na ${ms()}`);
  process.exit(e.code === 4401 ? 0 : 1);
};
setTimeout(() => { console.log('time-out: geen reactie binnen 15 s'); process.exit(2); }, 15_000);
