> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.uk.md) · [🇳🇱 **Nederlandse versie**](./2026-07-28_IDENTITY_ADMIN_BRIDGE_V1.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Checkpoint — Identity Admin Bridge v1

## Completed in Hub
- One-time service handoff creation and consumption.
- Service-scoped sessions for Identity.
- Shared admin business functions for Hub and Identity routes.
- Service account overview, deletion and workspace restoration contracts.
- Service-session revocation during recoverable account deletion.
- Visible Hub account/admin controls moved to Identity navigation.
- Emergency owner-only legacy admin query retained for rollback.

## Still verified in the Identity application
- Host-only HttpOnly tab session cookie.
- Real participant list and access-request actions.
- Full/limited/block/delete/recover controls.
- Self account overview and deletion.

## Rollback
Apply the previous AppDeploy version if the service bridge cannot be accepted.