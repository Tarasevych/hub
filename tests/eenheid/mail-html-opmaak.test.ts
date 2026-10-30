// Uitgaande e-mail-HTML: de opmaak van de editor (tabellen met inline stijlen) moet heel blijven in Gmail; gevaarlijke dingen niet.
// Incident 10.10 «Тест 1»: kop-, accent- en voetblok en de knop kwamen in Gmail als kale tekst aan.
import { mailHtmlToPlainText, normalizeOutboundMailHtml, safeStyle } from '../../backend/mail-opstel-html';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-html-opmaak');
  // zoals serializeEmail (MailComposeEditor) het sjabloon «Діловий лист» uitschrijft
  const sjabloon = '<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827;background:#ffffff;padding:24px;box-sizing:border-box">'
    + '<p style="margin:0 0 12px;text-align:left">привіт, <strong>жирним</strong></p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-mail-block="header" data-bg="#eff6ff" style="margin:0 0 12px"><tr><td style="background:#eff6ff;padding:18px;border-radius:9px"><p style="margin:0 0 12px;text-align:center">Tarasevych Mail</p></td></tr></table>'
    + '<h1 style="margin:0 0 14px;text-align:left">Важлива інформація</h1>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-mail-block="callout" data-kind="info" data-bg="#eef6ff" style="margin:0 0 12px"><tr><td style="background:#eef6ff;padding:14px 16px;border-left:4px solid #2563eb;border-radius:8px"><p>Головний акцент</p></td></tr></table>'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-mail-block="button" data-url="https://example.com/" data-text="Детальніше" data-bg="#2563eb" data-fg="#ffffff" data-align="left"><tr><td align="left"><!--[if mso]><v:roundrect href="https://example.com/"><center style="color:#fff">Детальніше</center></v:roundrect><![endif]--><!--[if !mso]><!--><a href="https://example.com/" style="display:inline-block;padding:12px 18px;border-radius:6px;background:#2563eb;color:#ffffff;font-weight:700;text-decoration:none">Детальніше</a><!--<![endif]--></td></tr></table>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-mail-block="divider"><tr><td style="border-top:1px solid #d1d5db;height:1px;font-size:1px;line-height:1px">&nbsp;</td></tr></table>'
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-mail-block="image"><tr><td><img src="https://example.com/a.png" alt="logo" width="200" style="display:block;max-width:100%;height:auto;border:0"></td></tr></table>'
    + '</div>';
  const uit = normalizeOutboundMailHtml(sjabloon);
  check('tabellen + cellen blijven (opmaak voor Gmail/Outlook)', /<table role="presentation" width="100%"/.test(uit) && /<td style="background-color:#eff6ff;padding:18px;border-radius:9px">/.test(uit), uit.slice(0, 400));
  check('achtergrond (shorthand) wordt background-color, padding/rand/ronde hoeken blijven', /background-color:#eef6ff;padding:14px 16px;border-left:4px solid #2563eb;border-radius:8px/.test(uit));
  check('knop: inline-block met padding, kleur en ronde hoeken', /<a href="https:\/\/example.com\/" style="display:inline-block;padding:12px 18px;border-radius:6px;background-color:#2563eb;color:#ffffff;font-weight:700;text-decoration:none">Детальніше<\/a>/.test(uit));
  check('Outlook-VML weg: knoptekst maar één keer', (uit.match(/Детальніше/g) || []).length === 2 /* data-text + de knop zelf */ && !/roundrect|<center/i.test(uit), String((uit.match(/Детальніше/g) || []).length));
  check('blokmarkeringen voor het heropenen in de editor blijven (data-mail-block, data-bg …)', /data-mail-block="callout" data-kind="info" data-bg="#eef6ff"/.test(uit) && /data-mail-block="button" data-url="https:\/\/example.com\/" data-text="Детальніше"/.test(uit));
  check('afbeelding (https) met breedte en stijl', /<img src="https:\/\/example.com\/a.png" alt="logo" width="200" style="display:block;max-width:100%;height:auto;border:0">/.test(uit));
  check('omhulsel: lettertype, achtergrond, padding, box-sizing', /<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827;background-color:#ffffff;padding:24px;box-sizing:border-box">/.test(uit));

  // veiligheid
  const kwaad = normalizeOutboundMailHtml('<p onclick="x()" style="color:red;background:url(javascript:alert(1));position:fixed">a</p><script>alert(1)</script><img src="javascript:alert(1)"><img src="http://x/y.png"><a href="javascript:alert(1)">b</a><iframe src="https://x"></iframe><table onmouseover="x"><tr><td style="width:expression(alert(1))">c</td></tr></table>');
  check('geen script/iframe/on…/javascript:/url()/expression()/http-afbeeldingen', !/script|iframe|onclick|onmouseover|javascript|expression|url\(|http:\/\/x/i.test(kwaad) && /<p>a<\/p>/.test(kwaad) && /<a>b<\/a>/.test(kwaad) && !/<img/.test(kwaad), kwaad);
  check('onbekende CSS (position, behavior) valt weg', safeStyle('position:fixed;z-index:9;color:#111111') === 'color:#111111');
  check('kleur-waarden: alleen hex/rgb (geen var(), geen named)', safeStyle('color:var(--x);background-color:red;color:#abc') === 'color:#abc');
  check('platte tekst: cellen en regels blijven leesbaar', /Tarasevych Mail/.test(mailHtmlToPlainText(uit)) && /Важлива інформація/.test(mailHtmlToPlainText(uit)));
  check('leeg/alleen opmaak → leeg', normalizeOutboundMailHtml('<table><tr><td>&nbsp;</td></tr></table>') === '');
  return einde();
}
