> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./CLOUD_DATABASE_SCHEMA.uk.md) · **🇳🇱 Nederlands** ([origineel](./CLOUD_DATABASE_SCHEMA.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Cloud-databaseschema — v1

Alle records zijn standaard privé en gebonden aan de eigenaar (`owner-scoped`). Database-ID's worden door het platform gegenereerd.

## `cloud_workspaces_v1`

| Veld | Type | Regel |
|---|---|---|
| `ownerUserId` | string | verplichte tenantgrens |
| `title` | string | 2–100 tekens |
| `normalizedTitle` | string | NFKC + kleine letters; uniek binnen de eigenaar |
| `description` | string | maximaal 500 tekens |
| `template` | enum | `project`, `documentation`, `meeting`, `personal` |
| `sections` | array | stabiele, ondiepe visuele ankers; geen mappen |
| `status` | enum | `active`, `archived` |
| `createdAt`, `updatedAt` | epoch ms | beheerd door de server |
| `archivedAt` | epoch ms | `0` zolang actief |

Conceptueel vereiste indexen/querysleutels:

- `(ownerUserId, status)`;
- `(ownerUserId, normalizedTitle)`.

## `cloud_items_v1`

| Veld | Type | Regel |
|---|---|---|
| `ownerUserId` | string | verplichte tenantgrens |
| `workspaceId` | string | leeg betekent Quick Capture |
| `suggestedWorkspaceId` | string | uitsluitend een bestaande werkruimte van de eigenaar |
| `kind` | enum | `file`, `note`, `link` |
| `title` | string | AI of deterministische terugvaloptie (fallback), max. 120 |
| `originalName` | string | alleen label van de bestandsbron |
| `description` | string | max. 500 |
| `textContent` | string | notitie-inhoud, max. 50k |
| `sourceUrl` | string | genormaliseerde HTTP(S)-URL |
| `mimeType` | string | door de server gevalideerd veilig type |
| `sizeBytes` | number | gedecodeerde bytes |
| `storagePath` | string | door de server gegenereerd, nooit openbaar |
| `tags`, `people` | string[] | begrensd en ontdubbeld |
| `status` | enum | `captured`, `waiting_review`, `in_progress`, `done` |
| `aiState` | enum | `suggested`, `fallback` |
| `aiConfidence` | number | begrensd op 0–1 |
| `createdAt`, `updatedAt`, `openedAt` | epoch ms | beheerd door de server |

Conceptueel vereiste indexen/querysleutels:

- `(ownerUserId, updatedAt)`;
- `(ownerUserId, workspaceId)`;
- `(ownerUserId, status)`.

## `cloud_resume_v1`

Eén effectief recentste record per eigenaar.

| Veld | Type |
|---|---|
| `ownerUserId` | string |
| `currentWorkspaceId` | string |
| `currentItemId` | string |
| `focus` | boolean |
| `energy` | `low`, `medium`, `high` |
| `updatedAt` | epoch ms |

## `cloud_ai_decisions_v1`

Slaat begrensd bewijsmateriaal op zonder de ruwe iteminhoud te dupliceren.

| Veld | Type |
|---|---|
| `ownerUserId` | string |
| `itemId` | string |
| `inputFingerprint` | SHA-256 hex |
| `state` | `suggested`, `fallback` |
| `reasonCode` | string |
| `confidence` | number |
| `suggestedWorkspaceId` | string |
| `createdAt` | epoch ms |

## `cloud_audit_v1`

| Veld | Type |
|---|---|
| `ownerUserId` | string |
| `action` | string met namespace |
| `entityType` | `workspace`, `item`, toekomstige provider-/deeltypen |
| `entityId` | string |
| `details` | niet-geheime begrensde metadata |
| `createdAt` | epoch ms |

Initiële acties:

- `cloud.workspace.created`;
- `cloud.item.captured`;
- `cloud.item.placed`;
- `cloud.item.status.changed`.

## Toekomstige tabellen (niet actief in runtime)

- `cloud_jobs_v1` — geleasete idempotente worker-wachtrij;
- `cloud_content_chunks_v1` — geëxtraheerde inhoudsfragmenten en vingerafdrukken;
- `cloud_search_documents_v1` — hybride indexdocumenten;
- `cloud_provider_accounts_v1` — status van eigenaar-/provideraccounts;
- `cloud_oauth_tokens_v1` — versleutelde refresh-token-enveloppen;
- `cloud_sync_state_v1` — cursor-/deltastatus van providers;
- `cloud_provider_items_v1` — projecties van externe objecten;
- `cloud_shares_v1` — kortlevend, herroepbaar en scope-gebonden delen;
- `cloud_item_links_v1` — gekoppelde opnames / relatiegraaf;
- `cloud_reminders_v1` — zachte check-ins met door de gebruiker bepaalde cadans.
