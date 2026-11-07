import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { leesOntwikkelArchief } from './shared/ontwikkelarchief';
import { controleerOntwikkelArchiefOnline } from './backend/uitrol-ontwikkelarchief';

const [refPad, pakket, versie, commit] = process.argv.slice(2);
const gelezen = leesOntwikkelArchief(readFileSync(refPad, 'utf8'), versie, commit);
console.log('ref fouten:', gelezen.fouten.join(',') || 'geen');
if (!gelezen.ref) process.exit(1);
const pakketSha = createHash('sha256').update(readFileSync(pakket)).digest('hex');
controleerOntwikkelArchiefOnline(gelezen.ref, pakketSha).then((r) => {
  console.log('resultaat:', JSON.stringify(r));
});
