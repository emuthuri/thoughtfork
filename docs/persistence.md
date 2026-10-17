# Save contract (design before implementation)

A successful mutation means the intended change was applied to the latest ledger, validated, written to a unique sibling temporary file, flushed, read back, and renamed over the canonical file before acknowledgement. Later explicit edits or a separately reviewed whole-ledger replacement can intentionally change it. This does not promise survival of drive failure, filesystem damage, or uncooperative external editors.

The application has one OS-owned writer per canonical ledger path (Windows named pipe; exclusive loopback ownership socket on other platforms). Ownership disappears on process exit/crash; no stale filesystem lock can permanently block startup. A second writer fails closed. Old, lock-unaware versions and external file editors must be stopped; hashes detect external changes but cannot provide atomic compare-and-swap against uncooperative processes.

Every mutation receives/parses/validates its complete body first, then enters a small process-local serialized queue. The queue covers PATCH, capture, import/recovery commit and manual snapshot. The latest bytes are read and validated in that boundary. GET never seeds, reformats or migrates data.

The ledger has a monotonically increasing meta.revision while its current state is readable (legacy absent means zero; recovery from unreadable bytes starts a new generation at revision one), and a replacement generation (legacy absent means legacy). Per-idea tokens hash the generation and the complete idea. Different ideas can be edited independently from stale tabs; a stale edit to the same idea is conservatively a conflict. Imports/restores rotate the generation and require a preview token bound to the exact current-file hash, candidate hash and mode. Capture requires the observed generation. No arbitrary merge or silent retry of conflicting values.

HTTP 409 includes the newer idea/version or asks the user to preview replacement again. HTTP failure never means UI success. Client saves per idea run in order; confirmed state is separate from durable browser drafts. Unsaved/failed/conflicted comments, editor values and capture values survive ordinary same-tab reload using localStorage, namespaced by ledger identity and tab. Browser storage failure is visible and unload protection remains, but storage clearing/private-session loss cannot be guaranteed against. Export fetches confirmed server state.

Capture and pre-import snapshots, recovery forensic copies, and manual snapshots are mandatory and verified: failure aborts the operation. Periodic pre-change snapshots are best effort, attempted on ordinary edits at most once per ten-minute success interval; failure is returned as a visible warning and does not turn a committed edit into a reported failure. Snapshot names use UUIDs and exclusive creation; no automatic pruning.

Import is explicit whole-ledger replacement, never an implicit merge. Full validation and a review of counts, disappearing IDs, changed raw text and schema compatibility precede a separate commit. Empty replacement requires separate acknowledgement. Normal import requires a verified pre-import snapshot. Recovery may load a valid backup or validated file even when the canonical bytes are malformed; it must preserve the damaged bytes without parsing them before replacement. Recovery mode blocks ordinary mutations.

Mutations require the expected local Host, same-origin Origin when present, non-cross-site Fetch metadata, application/json and allowed HTTP methods. No accounts, cloud or third-party runtime dependencies.

Durability limit: fsync of the new file and verified rename protect ordinary process interruption; Windows/disk-controller behavior and sudden machine power loss are not proven. A lost HTTP response is an uncertain outcome, not permission to automatically repeat a capture/import. Review confirmed state before retrying such an operation.

## Running the regression suite

Production and the core tests need only Node.js 18+:

```powershell
npm test
```

The tests generate synthetic ledgers under the OS temporary directory, never in the application's data directory. They verify bytes and persisted records, not only HTTP status. Fault injection is passed into LedgerStore by tests; there are no production HTTP fault switches. The pre-fix audit reproduced lost updates, false successful edits, unsafe imports, and trimmed captures against the old implementation.

Optional end-to-end browser tests use an independently available Playwright installation and Edge. Playwright is a QA tool, not an application dependency; no package is installed by the application:

```powershell
$env:LEDGER_PLAYWRIGHT_PATH = 'absolute/path/to/playwright'
$env:LEDGER_BROWSER_CHANNEL = 'msedge'
npm run test:browser
```

Browser tests also use isolated synthetic ledgers and cover ordinary workflows. The core `npm test` command does not require a browser or Playwright.

## Manual restore drill — synthetic data only

1. Create a separate scratch folder, copy application code there, and create a schema-2 synthetic ledger with the source/idea/review structure shown in tests/persistence.test.js. Do not copy private research into the drill.
2. Start that scratch server with `node server.js`. Click Snapshot and note the verified filename. Make one review change and confirm Saved.
3. Stop the scratch server. Save the synthetic canonical bytes elsewhere, then replace **only the scratch ledger.json** with malformed JSON such as `{ damaged drill`.
4. Restart the scratch server. It must show Recovery mode, leave the malformed bytes untouched, disable ordinary mutations, and list the earlier valid snapshot.
5. Choose the snapshot, review the replacement, and Restore. Verify the source/idea counts and original source text. Check that a uniquely named `ledger-damaged-*.bin` contains the exact malformed bytes.
6. Restart once more and verify the restored state loads. The old valid JSON backups and forensic file must remain present. There is no automatic pruning.

An ordinary import is different: it requires a valid canonical ledger, a fresh preview bound to the current file and candidate, and a verified pre-import JSON backup. Recovery never needs to parse the damaged original before preserving it.

## Precise operating limits

- File fsync and verified temporary replacement are tested against partial writes, flush failure, rename failure, and server restart. Parent-directory durability, sudden power loss, controller caches and drive failure are not proven; keep independent/off-device copies for irreplaceable work.
- Locking covers cooperating versions using the same canonical path. Stop any older lock-unaware server before starting the upgraded server. External editors, sync programs and hard-link aliases are not a supported multi-writer setup. An observed outside byte change fails closed and requires stopping external writers/restarting. There remains an unavoidable check/rename race with a process that ignores ownership.
- Windows ownership uses an OS named pipe keyed by the normalized canonical path, with no lock file or stale PID cleanup. The OS releases it on exit/crash. Other platforms use an exclusive deterministic loopback port; a hash-port collision can fail closed and must be diagnosed, never bypassed. Windows was exercised here; other operating systems still need smoke tests.
- Same-idea conflicts are deliberately conservative: even independent fields on one idea may require comparison. Different ideas are independently versioned. No arbitrary merge is performed.
- Capture, manual snapshots, pre-import backup, and damaged-file preservation are mandatory. Failure aborts the requested operation. Ordinary PATCH periodic snapshots are pre-change copies attempted after ten minutes since the last successful backup, including the first ordinary edit after startup. Failure is visibly returned with the committed edit, and the next edit retries. Captures always take their own pre-change backup. Snapshots are not a per-edit history or a timed post-edit backup.
- Import/preview/recovery allow 128 MiB JSON requests by default; other mutations allow 32 MiB. Oversize requests receive a useful 413 after the request is drained; the canonical ledger is unchanged. Export can be larger; review size limitations before moving very large corpora. Increasing capacity is a separate measured decision.
- Browser drafts are stored per ledger identity and tab in localStorage, with the tab ID in sessionStorage. They survive normal same-tab reload, not guaranteed clearing of site data, private browsing shutdown, deliberate discard, storage eviction, or permanent browser/device loss. Storage failures are visible and unload protection remains. Different origins/ports have separate browser storage. Closing a whole tab retains its browser data but automatic discovery in a brand-new tab is not implemented; save or copy drafts before closing it. Retained drafts contain private text on this computer and are removed when saved/discarded.
- Cancel/X/Escape close editors while retaining changed drafts; Discard draft is explicit. A failed save never closes the editor. A preview comparison can explicitly apply the user's draft to the reviewed current version; another intervening edit still conflicts. Capture conflicts after replacement require an explicit review of the new corpus before retry.
- The server cannot distinguish a lost response from an uncommitted mutation at the client. Confirmed GET can reconcile an identical idea draft in the same generation; capture/import are never automatically repeated. A repeated uncertain capture can create a duplicate; inspect confirmed state before retrying.
- Export fetches confirmed server state. Unsaved browser drafts are excluded and labelled as excluded. This protects JSON export; existing Markdown rendering remains a view of confirmed state loaded in that tab and is not a cross-tab live subscription.
- This pass adds no automatic recovery overwrite, migration on read, backup pruning, cloud service, user accounts, database, event log, extraction workflow, graph UI, or search redesign.
