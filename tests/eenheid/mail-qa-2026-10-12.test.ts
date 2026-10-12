// Regressies uit het QA-verslag van mail.* (12.10.2026, computer + telefoon). Elke check verwijst naar een punt uit
// claude/mail/QA-POSHTA-2026-10-12.md of QA-POSHTA-MOBILNA-2026-10-12.md.
import { readFileSync } from 'node:fs';
import { ARCHIEF_GMAIL_QUERY, isGearchiveerd } from '../../shared/mail-archief';
import { checker } from './hulp/nep-google';

const bron = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-qa-2026-10-12');

  // №2 «Архів» toont gearchiveerde brieven aan mezelf (label SENT) wél, gewone verzonden brieven niet.
  const ik = 'pavlo@example.test';
  check('архів: ontvangen brief zonder INBOX → in archief', isGearchiveerd({ labelIds: ['IMPORTANT'], from: 'olena@example.test', to: ik }));
  check('архів: brief aan mezelf (SENT, geen INBOX) → in archief', isGearchiveerd({ labelIds: ['SENT'], from: `Павло <${ik}>`, to: ik }));
  check('архів: brief aan mezelf via eigen adres (cc) → in archief', isGearchiveerd({ labelIds: ['SENT'], to: 'x@example.test', cc: ik, eigenAdres: ik }));
  check('архів: gewone verzonden brief aan iemand anders → NIET in archief', !isGearchiveerd({ labelIds: ['SENT'], from: ik, to: 'olena@example.test', eigenAdres: ik }));
  check('архів: in Вхідних / prullenbak / spam / concept → NIET', ['INBOX', 'TRASH', 'SPAM', 'DRAFT'].every((l) => !isGearchiveerd({ labelIds: [l], from: ik, to: ik })));
  check('архів: Gmail-query laat verzonden-aan-mezelf toe', ARCHIEF_GMAIL_QUERY.includes('{-label:sent to:me cc:me}') && !/(^| )-label:sent( |$)/.test(ARCHIEF_GMAIL_QUERY));
  const werkplek = bron('src/GoogleMailWorkspace.tsx');
  check('архів: werkplek gebruikt de gedeelde query en regel', werkplek.includes("tab==='archive'?{labelId:'',q:ARCHIVE_QUERY}") && werkplek.includes('isGearchiveerd('));
  check('архів: geen oude «-label:sent»-uitsluiting meer in src/backend', !/-label:inbox -label:sent|'-label:sent',/.test(werkplek + bron('src/mail-search.ts') + bron('backend/mail-search.ts')));

  // №3 / №4 vensters «Новий лист»
  const nieuw = bron('src/MailNewMessageDialog.tsx');
  check('№3 elke opening begint met uitgeklapte kop (setKopOpen(true))', /if \(!open \|\| was\) return;\n\s*\/\/ QA 12\.10 №3[^\n]*\n\s*setKopOpen\(true\);/.test(nieuw));
  check('№3 kop klapt niet in bij focusverlies zonder doel (relatedTarget null)', nieuw.includes('naar && dialogRef.current?.contains(naar)'));
  check('№4 eerste opening telt als nieuw (vorigOpen start op false)', nieuw.includes('const vorigOpen = useRef(false);'));
  check('№4 geen dubbel concept als het al zo bewaard is', nieuw.includes('bewaardRef.current !== handtekening('));
  check('№4 editor wordt leeg bij value=\'\'', bron('src/MailComposeEditor.tsx').includes("if(value!==current&&(value||view.state.doc.textContent.trim()||view.state.doc.content.size>2))"));
  const { adressenGeldig } = await import('../../src/mail-adressen');
  check('№12 adrescontrole: «t» ongeldig, gewone en «Naam <adres>» geldig', !adressenGeldig('t') && adressenGeldig('olena@example.test') && adressenGeldig('Олена <olena@example.test>, b@x.be') && !adressenGeldig('a@b'));
  check('№12 Tab uit «Тема» springt naar de tekst', nieuw.includes("event.key === 'Tab' && !event.shiftKey") && nieuw.includes('editorRef.current?.focus()'));
  // M1 zwevende knop
  const zijbalk = bron('src/MailSidebarNavigation.tsx');
  check('M1 tik op «Написати» opent het venster (slepen pas na > 8 px)', zijbalk.includes('Math.hypot(event.clientX-d.startX,event.clientY-d.startY)<=8') && zijbalk.includes('if(justDraggedRef.current){justDraggedRef.current=false;return}setComposeOpen(true)'));
  check('M1 venster in portal (niet in de verborgen zijbalk)', zijbalk.includes('createPortal(<MailNewMessageDialog'));
  // M2 selectie op aanraakscherm
  for (const pad of ['src/MailMessageRow.tsx', 'src/MailMinimumMessageRow.tsx']) {
    const rij = bron(pad);
    check(`M2 ${pad}: lang indrukken slikt de volgende klik in`, rij.includes("document.addEventListener('click',swallow,true)"));
    check(`M2 ${pad}: lang indrukken werkt ook op de tekst van de rij`, rij.includes("button:not(.mail-row-open-hit),a[href],[role=checkbox],input,.mail-row-hover-actions"));
  }
  check('M2 in selectiemodus wisselt een tik de selectie', bron('src/MailMessageRow.tsx').includes("if(selectable&&lastPointer.current!=='mouse'&&onToggle"));
  check('№10 los selectievakje als de avatar uit staat', bron('src/MailMessageRow.tsx').includes("className={`mail-row-select-box${selected?' is-on':''}`}"));
  // №1 bulk niet meer geblokkeerd door de cache; foutcode zichtbaar
  check('№1 bulk: melding direct, cache op de achtergrond', werkplek.includes("showActionUndo([...affectedByAccount.keys()][0]||accountId,actionLabel,'',undoSteps,undoRestoreRows);reconcileLabelSnapshots([...affectedByAccount.keys()]);void Promise.all("));
  check('№1 bulk: foutmelding met code', werkplek.includes('Масову дію не завершено${code?` (код ${code})`'));
  // №8 geen systeemvenster bij «До кошика»
  check('№8 geen window.confirm meer bij naar de prullenbak', !/window\.confirm\(t\('Перемістити (цей лист|вибрані)/.test(werkplek) && !werkplek.includes('Перемістити вибрані листи (${selectedCount}) до кошика Gmail?'));
  // №6 «У Вхідні» als een gekozen brief buiten Вхідні staat
  check('№6 knop «У Вхідні» ook buiten «Архів»', werkplek.includes("tab==='archive'||(!categorySelection&&selectedLoadedMessages.some("));
  // №13 / №14 teksten
  check('№13 schatting toont «із багатьох» i.p.v. een fout getal', bron('src/MailSectionMenu.tsx').includes("t('багатьох','vele')"));
  check('№14 geen «durable cursor» meer voor de gebruiker', !werkplek.includes('durable cursor'));
  check('№15 «До кошика» standaard in de bovenbalk (client en server)', bron('src/MailQuickSettings.tsx').includes("['archive','trash','read','star']") && bron('backend/mail-view-preferences.ts').includes("['archive','trash','read','star']"));
  check('№15 antwoord standaard ingeklapt', bron('src/MailThreadContent.tsx').includes('[replyIngeklapt,setReplyIngeklapt]=useState(true)'));
  check('№17 Drive pas na klik (geen 409 bij elk nieuw venster)', !bron('src/MailDiskKnop.tsx').includes("useEffect(() => { void laad('root', '');"));
  const css = bron('src/mail-qa-2026-10.css');
  check('CSS: QA-stijlen geladen in de werkplek', werkplek.includes("import'./mail-qa-2026-10.css'"));
  check('CSS: footer van het venster niet meer smaller (globale <footer>-regel geneutraliseerd)', css.includes('.mail-new-message>footer{width:auto!important;max-width:none!important;margin:0!important'));
  check('CSS: zijbalkstrook blokkeert «Назад до списку» niet op de telefoon', css.includes('sidebar-drawer-mode:not(.sidebar-drawer) .canonical-sidebar'));

  check('Esc sluit eerst alleen een open menu (preventDefault in een-menu)', bron('src/platform/een-menu.ts').includes('d.querySelector(\'summary\')?.focus(); e.preventDefault();'));

  return einde();
}
