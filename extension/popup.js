// Pop-up 0.6: account + profiel van het actieve tabblad bovenaan, daaronder één kaart per slot (ui.js): «Як користувач» altijd,
// «Технічний профіль» alleen als dat slot gekoppeld is of het account technische rechten heeft. Per kaart: staat, aftellen, rechten en
// sites als chips, «Відкликати» (alleen dat slot), en de stap op de site (koppelen of toegang openen). Alle logica staat in ui.js (MR_UI).
const UI = globalThis.MR_UI;
let vensterId = null;
try {
  Promise.resolve(chrome.windows.getCurrent()).then((w) => { vensterId = w && typeof w.id === 'number' ? w.id : null; }).catch(() => undefined);
} catch { /* geen windows-API */ }

document.getElementById('versie').textContent = `v${chrome.runtime.getManifest().version}`;
document.getElementById('opties').addEventListener('click', () => { void chrome.runtime.openOptionsPage(); });
document.getElementById('paneel').addEventListener('click', () => {
  // sidePanel.open vraagt een gebruikersgebaar: daarom meteen hier; lukt het niet, dan probeert de achtergrond het.
  let poging;
  try { poging = vensterId !== null ? Promise.resolve(chrome.sidePanel.open({ windowId: vensterId })) : Promise.reject(new Error('geen venster')); }
  catch (e) { poging = Promise.reject(e); }
  poging.catch(() => UI.vraag({ op: 'open-side-panel', windowId: vensterId })).finally(() => window.close());
});

// 0.8.0: snelle acties. «Перевірити з’єднання» opent de diagnose in de instellingen (daar staat per controle oorzaak + herstel).
document.getElementById('snel-test').addEventListener('click', () => { UI.openTab(chrome.runtime.getURL('options.html#diagnose')); window.close(); });
document.getElementById('snel-beheer').addEventListener('click', () => { UI.openTab(UI.URLS.beheer); window.close(); });

UI.start({ reden: 'popup' });
