> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./IDENTITY_ADMIN_BRIDGE_V1.uk.md) · [🇳🇱 **Nederlandse versie**](./IDENTITY_ADMIN_BRIDGE_V1.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Identity Admin Bridge v1

## Source of truth
Hub backend remains the only source of truth for users, access requests, roles, workspaces, deletion, recovery and audit.

## Flow
1. An authenticated Hub tab creates a one-time handoff code for `identity`.
2. The code expires after two minutes and can be consumed once.
3. Identity exchanges the code server-to-server.
4. Hub creates a service-scoped session with `identity.profile.read` and, for the owner, `identity.admin`.
5. The Identity application stores the service token only in a host-only HttpOnly cookie selected by a non-secret per-tab identifier.
6. Identity admin mutations call Hub service-admin endpoints, which reuse the same business functions as legacy Hub admin endpoints.

## Tab isolation
Each browser tab stores only a non-secret tab ID in sessionStorage. The secret service token is kept in an HttpOnly cookie whose name includes that tab ID. Logging out one Identity tab revokes only that service session.

## Safety
- one-time handoff;
- deny by default;
- owner checks on every administrative request;
- recoverable deletion;
- all Hub and service sessions revoked when an account is deleted;
- audit entries for handoff and administrative mutations;
- no service token in URLs, localStorage, sessionStorage or frontend logs.

## Rollback
The legacy Hub admin backend routes remain available. The normal Hub UI no longer exposes them. `?legacy-admin=1` is an emergency rollback entry for the owner only.