# Beleid van Mijn Ruimte (architectuur 13.10.2026, etap 6: OPA als aparte dienst, eerst in «schaduw»).
#
# Twee besluiten per verzoek:
#   huidig — precies wat de app NU beslist (backend/index.ts adminContext + ADMIN_CAPABILITIES). Verschil met de app = fout in
#            een van beide; zo bewijzen we dat het beleid klopt vóór het ooit iets mag tegenhouden.
#   doel   — de afgesproken toekomst: beheerrechten alleen in een ACTIEF technisch profiel met de passende mogelijkheid
#            (data.mijnruimte.doel_tech). Telt hoe vaak «doel» zou weigeren waar «huidig» toestaat: de impact van de latere schakelaar.
# In schaduw blokkeert niets; de app telt alleen (app.beleid_schaduw). Geen inhoud, e-mail of id's in de input.
package mijnruimte.toegang

import rego.v1

default huidig := {"allow": false, "reden": "onbekende-soort"}

huidig := {"allow": false, "reden": "geen-beheersessie"} if {
	input.soort == "admin"
	not beheersessie
}

huidig := {"allow": true, "reden": "eigenaar"} if {
	input.soort == "admin"
	beheersessie
	input.subject.eigenaar == true
}

huidig := {"allow": true, "reden": "rol"} if {
	input.soort == "admin"
	beheersessie
	input.subject.eigenaar != true
	input.capability in data.mijnruimte.admin_capabilities[input.subject.adminRol]
}

huidig := {"allow": false, "reden": "geen-recht"} if {
	input.soort == "admin"
	beheersessie
	input.subject.eigenaar != true
	not input.capability in object.get(data.mijnruimte.admin_capabilities, input.subject.adminRol, [])
}

beheersessie if {
	input.subject.dienst == "admin"
	input.subject.status == "approved"
}

default doel := {"allow": false, "reden": "huidig-weigert"}

doel := {"allow": false, "reden": "tech-niet-actief"} if {
	huidig.allow
	input.tech.actief != true
}

doel := {"allow": true, "reden": "tech"} if {
	huidig.allow
	input.tech.actief == true
	nodig := data.mijnruimte.doel_tech[input.capability]
	tech_heeft(nodig)
}

doel := {"allow": false, "reden": sprintf("tech-mist-%s", [nodig])} if {
	huidig.allow
	input.tech.actief == true
	nodig := object.get(data.mijnruimte.doel_tech, input.capability, "onbekend")
	not tech_heeft(nodig)
}

tech_heeft(nodig) if nodig == ""

tech_heeft(nodig) if {
	nodig != ""
	nodig in input.tech.mogelijkheden
}
