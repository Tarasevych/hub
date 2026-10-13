package mijnruimte.toegang_test

import rego.v1

import data.mijnruimte.toegang

basis := {"soort": "admin", "capability": "admin.read", "subject": {"eigenaar": false, "adminRol": "", "status": "approved", "dienst": "admin"}, "tech": {"actief": false, "mogelijkheden": []}}

test_eigenaar_mag_alles if {
	inp := object.union(basis, {"capability": "roles.manage", "subject": object.union(basis.subject, {"eigenaar": true})})
	toegang.huidig.allow with input as inp
}

test_zonder_rol_geweigerd if {
	not toegang.huidig.allow with input as basis
	toegang.huidig.reden == "geen-recht" with input as basis
}

test_rol_volgens_tabel if {
	inp := object.union(basis, {"capability": "apps.manage", "subject": object.union(basis.subject, {"adminRol": "apps_admin"})})
	toegang.huidig.allow with input as inp
	not toegang.huidig.allow with input as object.union(inp, {"capability": "users.manage"})
}

test_verkeerde_dienst if {
	inp := object.union(basis, {"subject": object.union(basis.subject, {"eigenaar": true, "dienst": "mail"})})
	not toegang.huidig.allow with input as inp
}

test_niet_goedgekeurd if {
	inp := object.union(basis, {"subject": object.union(basis.subject, {"eigenaar": true, "status": "pending"})})
	not toegang.huidig.allow with input as inp
}

test_doel_vraagt_tech if {
	inp := object.union(basis, {"subject": object.union(basis.subject, {"eigenaar": true})})
	toegang.huidig.allow with input as inp
	not toegang.doel.allow with input as inp
	toegang.doel.reden == "tech-niet-actief" with input as inp
}

test_doel_met_passende_mogelijkheid if {
	inp := object.union(basis, {"capability": "users.manage", "subject": object.union(basis.subject, {"eigenaar": true}), "tech": {"actief": true, "mogelijkheden": ["users.manage"]}})
	toegang.doel.allow with input as inp
}

test_doel_mist_mogelijkheid if {
	inp := object.union(basis, {"capability": "roles.manage", "subject": object.union(basis.subject, {"eigenaar": true}), "tech": {"actief": true, "mogelijkheden": ["diagnose.lezen"]}})
	not toegang.doel.allow with input as inp
	toegang.doel.reden == "tech-mist-roles.delegate" with input as inp
}

test_doel_nooit_ruimer_dan_huidig if {
	inp := object.union(basis, {"tech": {"actief": true, "mogelijkheden": ["users.manage", "roles.delegate"]}})
	not toegang.doel.allow with input as inp
}

test_onbekende_soort if {
	not toegang.huidig.allow with input as {"soort": "iets"}
}
