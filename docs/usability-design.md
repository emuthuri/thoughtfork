# Common-sense usability pass

## Existing mechanisms

SaveClient already debounces comments, synchronously stores form drafts, warns on unload and checks optimistic idea versions. Navigation already remembers idea order, projects and Back context. Source extraction, provenance ranges, reviewed imports, verified backups, Thread View and the single-writer launcher remain the foundation.

## Small extensions

Source notes gain optional revision metadata: the current text remains `raw`; `revisions` stores previous complete text/title snapshots and the recorded time of replacement. Legacy provenance refers to revision zero; newly extracted ranges identify the current revision. Source edits use source-version tokens, a verified backup and the same serialized atomic ledger writer. Restore creates a new revision. No automatic summary rewrite or load-time migration occurs. Schema version stays 2, with additive fields; older applications must not edit revised sources because they do not understand revision-bound excerpts.

Capture gains explicit cards submitted in one validated atomic transaction, each with its own source and To review idea. A stable capture request ID makes retries after a lost response idempotent. Blank cards are explained and skipped only after explicit review; invalid cards never partly commit.

Drafts remain in the existing SaveClient/browser storage. Draft discovery across window sessions, explicit recovery selection and synchronous input persistence address close/reopen. Visibility changes flush ordinary pending comments; beforeunload warns on unacknowledged work. Browser close cannot await an arbitrary server request and cannot guarantee prompts after a crash or without interaction. Capture is committed only on an explicit save; otherwise it is recoverable when local storage remains available. No second server draft store is justified for this pass.

Local preferences hold pins, reader size, view-specific order and tag filtering. They are organisational, never review judgments. Undo uses ordinary version-checked mutations and never restores a whole ledger. Bulk organisation is one reviewed transaction with all record preconditions checked before any mutation. Internal links use the current origin and stable IDs, with a ledger identity check.

## Windows identity

The existing pinned shortcut targets WScript while Edge owns the app window and assigns its own AppUserModelID. Changing only the icon cannot group these identities. Investigate a matching explicit shortcut/window AppUserModelID with relaunch metadata, preserving the existing launcher/server and ordinary browser profile. Real integration evidence is required before claiming pinned grouping; no hidden-icon workaround or heavyweight wrapper is planned.

## Scope and validation

Implement source history, capture cards/shortcuts, readable remembered typography, source order, recoverable drafts, conservative Undo, Recent/pins, existing-tag tools, search scope, internal links, keyboard context actions and bulk project/tag organisation. Preserve historical timestamps and missing-date ordering. Test persisted synthetic state, failure/conflict paths, appearance/narrow layouts and all existing regressions. Record protected hashes before/after. Any Windows shell behavior that cannot be reproduced or verified will be reported explicitly rather than called fixed.
