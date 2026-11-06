"""Vergelijk de volledige inhoud en bestandsrechten van twee echte updatepakketten."""
import hashlib
import sys
import tarfile
from pathlib import Path, PurePosixPath

PRODUCT = {"src/agenten/AgentBord.tsx", "src/agenten/agenten.css"}
PAKKETMETA = {
    "UITROL-VERSIE", "AUTEUR", "AGENT", "BRON-COMMIT", "SAMENVATTING",
    "UITROL-BASIS", "ONTWIKKELARCHIEF.json", "UITROL-MANIFEST.json", "TESTRESULTATEN",
}
TOEGEVOEGD = {
    "orchestratie/taken/DESIGN-003.json",
    "orchestratie/ontwikkelarchieven/DESIGN-003.json",
    ".github/workflows/design-003-release.yml",
    "tests/uitrol/design-003-pakket.py",
    "tests/visueel/design-003-agenten.html",
    "tests/visueel/design-003-agenten.tsx",
    "tests/visueel/design-003-controle.mjs",
}


def inhoud(bestand):
    wortel = Path(bestand).name.removesuffix(".tar.gz")
    result = {}
    with tarfile.open(bestand, "r|gz") as archief:
        for item in archief:
            pad = PurePosixPath(item.name)
            if not pad.parts or pad.parts[0] != wortel or ".." in pad.parts:
                raise ValueError(f"Onverwacht pad: {item.name}")
            if item.isdir():
                continue
            naam = str(pad.relative_to(wortel))
            if naam in result:
                raise ValueError(f"Dubbele archiefnaam: {naam}")
            if item.isfile():
                with archief.extractfile(item) as stream:
                    waarde = hashlib.file_digest(stream, "sha256").hexdigest()
            elif item.issym() or item.islnk():
                waarde = item.linkname
            else:
                raise ValueError(f"Onverwacht bestandstype: {naam}")
            result[naam] = (item.type, item.mode, waarde)
    return result


def vergelijk(basis, voorstel):
    oud, nieuw = inhoud(basis), inhoud(voorstel)
    verwijderd = oud.keys() - nieuw.keys()
    toegevoegd = nieuw.keys() - oud.keys()
    gewijzigd = {p for p in oud.keys() & nieuw.keys() if oud[p] != nieuw[p]}
    verwacht = PRODUCT | PAKKETMETA | {"ORCH-OVERDRACHT.json"}
    fouten = sorted(verwijderd | (toegevoegd ^ TOEGEVOEGD) | (gewijzigd - verwacht) | (PRODUCT - gewijzigd))
    if fouten:
        raise ValueError("Onverwacht pakketverschil: " + ", ".join(fouten))
    print(f"{len(oud)} basisbestanden, {len(oud) - len(gewijzigd)} byte- en modusgelijk, "
          f"{len(gewijzigd)} gewijzigd, {len(toegevoegd)} toegevoegd, {len(verwijderd)} verwijderd")
    for pad in sorted(gewijzigd):
        print(" *", pad)


if __name__ == "__main__":
    vergelijk(*sys.argv[1:])
