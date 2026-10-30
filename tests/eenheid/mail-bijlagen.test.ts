// Bijlagen in een nieuw bericht (3.2): multipart/mixed met het tekst/HTML-deel en elke bijlage als base64, veilige bestandsnamen.
import { buildMime } from '../../backend/mail-mime';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-bijlagen');
  const data = Buffer.from('%PDF-1.4 test').toString('base64');
  const mime = buildMime({ to: ['a@example.test'], subject: 'Fwd: рахунок', html: '<p>Привіт</p>', plainText: 'Привіт', attachments: [{ filename: 'рахунок "1".pdf', contentType: 'application/pdf', dataBase64: data }, { filename: 'x\r\nBcc: evil@x.test', contentType: 'text/html; evil', dataBase64: Buffer.from('a').toString('base64') }] });
  check('multipart/mixed rond multipart/alternative', /Content-Type: multipart\/mixed; boundary="mx_/.test(mime) && /Content-Type: multipart\/alternative; boundary="mr_/.test(mime));
  check('bijlage met Content-Disposition en base64-inhoud', /Content-Disposition: attachment; filename="=\?UTF-8\?B\?/.test(mime) && mime.includes(data));
  check('geen header-injectie via bestandsnaam of type', !/\r\nBcc: evil/.test(mime) && /Content-Type: application\/octet-stream; name=/.test(mime));
  check('zonder bijlagen: gewoon multipart/alternative', /^(?:(?!multipart\/mixed)[\s\S])*$/.test(buildMime({ to: ['a@example.test'], subject: 's', html: '<p>x</p>', plainText: 'x' })));
  return einde();
}
