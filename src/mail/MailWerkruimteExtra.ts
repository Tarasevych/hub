// Лінивий допоміжний модуль робочої області пошти (UPD-013):
// винесення 30 модулів визначення можливостей спеціалізованих редакторів вкладень
// за межі початкової збірки поштового списку (підвантажується лише під час відкриття вкладення).

import type { MailAttachmentPreview } from '../MailBijlageVoorbeeld';
import { mailArchiveCapability } from '../mail-archief-mogelijkheden';
import { mailMessageCapability } from '../mail-bericht-mogelijkheden';
import { mailSecurityCapability } from '../mail-beveiliging-mogelijkheden';
import { mailBioinformaticsCapability } from '../mail-bioinformatica-mogelijkheden';
import { mailCadCapability } from '../mail-cad-mogelijkheden';
import { mailDatabaseCapability } from '../mail-database-mogelijkheden';
import { mailDevOpsCapability } from '../mail-devops-mogelijkheden';
import { mailDocumentCapability } from '../mail-document-mogelijkheden';
import { mailThreatCapability } from '../mail-dreiging-mogelijkheden';
import { mailPrepressCapability } from '../mail-drukvoorbereiding-mogelijkheden';
import { mailEbookCapability } from '../mail-ebook-mogelijkheden';
import { mailFinanceCapability } from '../mail-financien-mogelijkheden';
import { mailGraphicsCapability } from '../mail-grafisch-mogelijkheden';
import { mailFontCapability } from '../mail-lettertype-mogelijkheden';
import { mailLogisticsCapability } from '../mail-logistiek-mogelijkheden';
import { mailMediaDocumentCapability } from '../mail-media-document-mogelijkheden';
import { mailMedicalCapability } from '../mail-medisch-mogelijkheden';
import { mailMlCapability } from '../mail-ml-mogelijkheden';
import { mailMusicCapability } from '../mail-muziek-mogelijkheden';
import { mailNetworkCapability } from '../mail-netwerk-mogelijkheden';
import { mailGovernmentCapability } from '../mail-overheid-mogelijkheden';
import { mailPersonalDataCapability } from '../mail-persoonsgegevens-mogelijkheden';
import { mailPresentationCapability } from '../mail-presentatie-mogelijkheden';
import { mailSpreadsheetCapability } from '../mail-rekenblad-mogelijkheden';
import { mailGameDevCapability } from '../mail-spelontwikkeling-mogelijkheden';
import { mailLinguisticsCapability } from '../mail-taalkunde-mogelijkheden';
import { mailEngineeringCapability } from '../mail-techniek-mogelijkheden';
import { mailFixedLayoutCapability } from '../mail-vaste-indeling-mogelijkheden';
import { mailVttRpgCapability } from '../mail-vtt-rpg-mogelijkheden';
import { mailScientificCapability } from '../mail-wetenschappelijk-mogelijkheden';

export function berekenBijlageMogelijkheden(attachmentPreview: MailAttachmentPreview) {
  const { filename, contentType, descriptor } = attachmentPreview;
  const kind = descriptor.kind;
  return {
    document: mailDocumentCapability(filename, contentType),
    spreadsheet: mailSpreadsheetCapability(filename, contentType),
    database: mailDatabaseCapability(filename, contentType),
    presentation: mailPresentationCapability(filename, contentType),
    mediaDocument: mailMediaDocumentCapability(filename, contentType),
    fixedLayout: mailFixedLayoutCapability(filename, contentType),
    ebook: mailEbookCapability(filename, contentType),
    prepress: kind === 'prepress' ? mailPrepressCapability(filename, contentType) : null,
    graphics: ['image', 'graphics'].includes(kind) ? mailGraphicsCapability(filename, contentType) : null,
    cad: kind === 'cad' ? mailCadCapability(filename, contentType) : null,
    engineering: kind === 'engineering' ? mailEngineeringCapability(filename, contentType) : null,
    security: kind === 'security' ? mailSecurityCapability(filename, contentType) : null,
    threat: kind === 'threat' ? mailThreatCapability(filename, contentType) : null,
    network: kind === 'network-config' ? mailNetworkCapability(filename, contentType) : null,
    devops: kind === 'devops' ? mailDevOpsCapability(filename, contentType) : null,
    finance: kind === 'finance' ? mailFinanceCapability(filename, contentType) : null,
    logistics: kind === 'logistics' ? mailLogisticsCapability(filename, contentType) : null,
    government: kind === 'government' ? mailGovernmentCapability(filename, contentType) : null,
    message: kind === 'mail-message' ? mailMessageCapability(filename, contentType) : null,
    personalData: kind === 'personal-data' ? mailPersonalDataCapability(filename, contentType) : null,
    font: kind === 'font' ? mailFontCapability(filename, contentType) : null,
    archive: kind === 'archive' ? mailArchiveCapability(filename, contentType) : null,
    scientific: kind === 'scientific' ? mailScientificCapability(filename, contentType) : null,
    music: kind === 'music-document' ? mailMusicCapability(filename, contentType) : null,
    linguistics: kind === 'linguistics' ? mailLinguisticsCapability(filename, contentType) : null,
    vttRpg: kind === 'vtt-rpg' ? mailVttRpgCapability(filename, contentType) : null,
    ml: kind === 'ml-data' ? mailMlCapability(filename, contentType) : null,
    gameDev: kind === 'gamedev' ? mailGameDevCapability(filename, contentType) : null,
    bioinformatics: kind === 'bioinformatics' ? mailBioinformaticsCapability(filename, contentType) : null,
    medical: kind === 'medical' ? mailMedicalCapability(filename, contentType) : null,
  };
}

export type MailBijlageMogelijkheden = ReturnType<typeof berekenBijlageMogelijkheden>;
