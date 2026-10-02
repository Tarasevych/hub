# Cloud Platform Architecture — Workspace Functional v1

## 1. Purpose

`cloud.tarasevych.com` is a neuroinclusive digital-asset workspace, not a conventional folder browser. Its primary responsibility is to externalize part of the user's executive function: capture first, preserve context, reduce naming decisions, and make resumption obvious.

## 2. Architectural boundary

Cloud is a named service context inside the existing ecosystem and reuses, but does not own:

- CanonicalChrome;
- CanonicalAccountMenu;
- canonical Identity and tab-scoped session policy;
- language and theme controllers;
- owner approval gate.

Cloud owns a separate domain model. Existing Hub `workspaces` remain dashboard-composition workspaces and MUST NOT be reused as Cloud project workspaces. Cloud records use the `cloud_*_v1` namespace to prevent semantic and authorization leakage.

## 3. Context diagram

```text
Browser / CanonicalChrome
        |
        | canonical cloud session (ownerRequireSession)
        v
Cloud Functional UI
        |
        | owner-scoped Unified Cloud API
        v
Cloud Domain Service
  |          |             |             |
  v          v             v             v
Metadata DB  Private Blob  AI Facade     Audit / Resume
             Storage       (bounded)     State

Future provider boundary:
Cloud Domain Service -> Provider Registry -> OAuth Token Vault -> Adapter Worker
                                            |-> Google Drive
                                            |-> Microsoft Graph / OneDrive
                                            `-> Dropbox
```

## 4. Core aggregates

### CloudWorkspace
A context-bearing project/topic/life-area. It contains a stable template and shallow visual sections, not a user-maintained folder tree.

### CloudItem
A captured note, link or stored file. It may remain in Quick Capture (`workspaceId = ''`) indefinitely. Placement is optional and reversible.

### CloudResume
One owner-scoped continuation pointer: current workspace, current item, focus state and energy mode.

### CloudAiDecision
A non-content audit record of AI/fallback metadata decisions. Raw user content is not duplicated into this table.

## 5. Smart Capture pipeline

```text
User selects note/link/file
  -> strict validation and safe-type policy
  -> private object write (file only)
  -> deterministic fallback title
  -> bounded AI metadata extraction
       - title
       - short description
       - tags / explicit people
       - existing workspace suggestion
  -> validate AI output against owner-visible workspace IDs
  -> persist owner-scoped item
  -> persist decision fingerprint/status
  -> update Resume
  -> return calm success or fallback message
```

Failure policy:

- capture remains functional when AI fails;
- an object write is rolled back if metadata persistence fails;
- unsupported or oversized files fail before persistence;
- provider content is never treated as instructions;
- the AI cannot create permissions, execute tools, move data across owners or invent workspace IDs.

## 6. Search architecture

Phase 1 uses a deterministic weighted metadata index over:

- title;
- tags;
- explicit people;
- workspace title;
- description;
- source filename/URL;
- note text.

The API returns a declared mode `weighted-metadata-v1`; it does not claim vector or semantic indexing. Future deep indexing adds extracted text, embeddings and linked captures through asynchronous jobs without changing the Unified Cloud API contract.

## 7. Storage architecture

Own files are written to AppDeploy private object storage under an opaque owner hash and random object key. Metadata stores the object path server-side only. The browser receives a short-lived signed URL only after an owner-scoped open request.

Phase 1 safe-type policy:

- JPEG, PNG, WebP, GIF;
- PDF;
- plain text, CSV, Markdown;
- ZIP;
- Office Open XML and OpenDocument files;
- maximum 6 MB.

HTML, SVG and executable formats are intentionally excluded until malware scanning and content-disposition controls are proven.

## 8. Security and tenancy

Every protected request must satisfy all of the following:

1. canonical session exists;
2. session service is `cloud`;
3. user status is `approved`;
4. every DB lookup validates `ownerUserId`;
5. every workspace/item relationship is revalidated server-side;
6. storage paths never come from the client;
7. external URLs allow only HTTP(S), reject credentials and strip fragments;
8. high-risk sharing/provider mutations remain disabled.

Sharing is blocked until Actor A / Actor B adversarial isolation tests exist. Provider OAuth is blocked until token-vault, least-privilege scopes, revocation, webhook validation, sync cursors and rollback are accepted.

## 9. AI pipeline evolution

### Phase 1 — active
- synchronous, bounded naming and existing-workspace suggestion;
- deterministic fallback;
- output validation and decision fingerprint.

### Phase 2 — planned worker runtime
- `cloud_jobs_v1` queue;
- MIME-aware text extraction;
- chunking and content fingerprints;
- embeddings / lexical hybrid index;
- duplicate and linked-capture detection;
- photo grouping and review batches.

### Phase 3 — guarded assistance
- gentle check-ins;
- project starter wizard from captured context;
- reminders based on explicit item states;
- no autonomous external write or sharing.

## 10. Neuroinclusive release gates

A release fails when it introduces:

- mandatory organization during capture;
- deep folder navigation as the primary path;
- shame, overdue, failure or streak language;
- more than one dominant next action in low-energy mode;
- loss of Resume after refresh;
- inaccessible labels, keyboard focus or error identification;
- simulated provider connectivity;
- hidden owner-scope failures.

## 11. Concurrency and deployment isolation

Cloud development is isolated from the parallel Mail implementation:

- Cloud modules use `cloud-*` file and table namespaces;
- no `mail-*` source file, table or route is modified;
- shared-file edits are context-rich surgical diffs only;
- the newest applied snapshot is re-read before deploy;
- a changed shared anchor causes rebase/fail-safe, never whole-file overwrite;
- rollback is the immediately preceding applied Version ID.
