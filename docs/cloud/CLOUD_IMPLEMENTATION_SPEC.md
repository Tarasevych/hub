# Cloud Technical Specification — Workspace Functional

## 1. Phase 1 scope

### Implemented core

- separate Cloud workspace aggregate;
- Project Starter with four templates and generated shallow sections;
- Smart Capture for notes, links and safe files;
- optional placement: Quick Capture is the default;
- AI naming, metadata and existing-workspace suggestion;
- deterministic fallback when AI is unavailable;
- own private object storage;
- one-click placement from Quick Capture;
- item states: saved, waiting review, in progress, done;
- weighted context search;
- Resume pointer;
- low/medium/high energy density;
- workspace Focus mode integrated with CanonicalChrome;
- truthful provider-account boundary.

### Explicitly not active

- Google Drive, OneDrive or Dropbox OAuth/sync;
- background deep-content workers;
- OCR and photo sorting;
- vector embeddings;
- sharing;
- reminders/notifications;
- version history UI;
- destructive deletion.

## 2. Unified Cloud API

All requests use canonical Cloud session context and POST transport to preserve the existing ecosystem contract.

| Endpoint | Purpose |
|---|---|
| `/api/owner/cloud/bootstrap` | owner-scoped workspaces, items, Quick Capture, Resume and truthful capabilities |
| `/api/owner/cloud/workspaces/create` | create workspace and template sections |
| `/api/owner/cloud/capture` | capture note/link/file; AI + fallback metadata |
| `/api/owner/cloud/items/:id/place` | confirm workspace placement |
| `/api/owner/cloud/items/:id/status` | update functional state |
| `/api/owner/cloud/items/:id/open` | update Resume and issue signed file URL or return note/link |
| `/api/owner/cloud/search` | weighted context search |
| `/api/owner/cloud/resume` | persist workspace/item/focus/energy context |
| `/api/owner/cloud/platform-status` | evidence-oriented actual-state contract |

## 3. Validation and error contract

Stable error codes include:

- `OWNER_CLOUD_SESSION_REQUIRED`;
- `CLOUD_WORKSPACE_TITLE_REQUIRED`;
- `CLOUD_WORKSPACE_ALREADY_EXISTS`;
- `CLOUD_WORKSPACE_LIMIT_REACHED`;
- `CLOUD_WORKSPACE_NOT_FOUND`;
- `CLOUD_CAPTURE_TEXT_REQUIRED`;
- `CLOUD_CAPTURE_URL_INVALID`;
- `CLOUD_CAPTURE_FILE_UNSUPPORTED`;
- `CLOUD_CAPTURE_FILE_SIZE`;
- `CLOUD_STORAGE_WRITE_FAILED`;
- `CLOUD_ITEM_NOT_FOUND`;
- `CLOUD_ITEM_STATUS_INVALID`;
- `CLOUD_SEARCH_QUERY_REQUIRED`.

User-facing copy translates failures into calm, non-punitive messages and confirms that input/data was not discarded whenever true.

## 4. UX information architecture

Canonical local tabs:

1. Overview;
2. Workspaces;
3. Smart Capture;
4. Quick Capture;
5. Search;
6. Recent;
7. Accounts.

Low-energy mode removes secondary metrics and reduces visible context. Focus mode hides only the Canonical sidebar while preserving account/session controls.

## 5. Accessibility requirements

- labels or explicit accessible names on every input/control;
- visible keyboard focus;
- `role=alert` for identified errors and `role=status` for success;
- no color-only status communication;
- minimum touch target follows the canonical shell sizing;
- dialogs are modal, labelled and closeable;
- reduced-motion preference disables nonessential animation;
- consistent placement and bilingual UA/NL copy;
- no mandatory naming or workspace selection during capture.

## 6. Acceptance tests

### Core sanity
Create a workspace, capture a note without placement, observe an AI/fallback title and place it with one action.

### Resume
Open an item, refresh, use “You stopped here”, and return to the same item/workspace.

### Guardrail
Attempt unsupported/oversized file capture; show a calm error and create no item.

### Isolation regression
Cloud changes must not alter Mail routes, Mail source modules, provider token tables, CanonicalChrome, AccountMenu or OAuth behavior.

### Responsive/accessibility
At 375×667, Smart Capture, workspace creation, Quick Capture placement, Focus exit and account control remain reachable by keyboard/touch.

## 7. Rollout gates

1. source validation and TypeScript build;
2. automated E2E terminal pass;
3. zero frontend/backend runtime errors;
4. rollback Version ID recorded;
5. owner browser check on `cloud.tarasevych.com`;
6. provider OAuth remains disabled until a separate accepted slice.
