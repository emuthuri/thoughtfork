# Everyday use

## Source notes and history

Choose **Edit source note** in Full Source or Raw Sources. Editing a source note changes its current title/text, keeps the previous complete text/title and a replacement timestamp, and requires a verified backup. **Edited N times · View history** exposes the older versions. Restore creates another revision; it does not erase later edits. Opening and restoring Windows text preserves its original newlines when unchanged in the editor.

Extracted summaries never change automatically. Existing provenance refers to source revision zero, even after current text changes. New extraction records the current revision when needed. Excerpt offsets are interpreted against that revision's text in Review, Thread View and Markdown exports. A stale source edit fails safely; **Compare with latest saved source** lets you inspect the latest text and explicitly choose that version as the save base while keeping your entered draft.

These are additive schema-2 fields (`revisions`, source timestamps and optional `sourceRevision` on provenance). Legacy notebooks are not rewritten on load, and missing creation dates remain unknown. Updated applications can read legacy records. Do not open a revised-source notebook for editing in an older thoughtFork build: it cannot interpret revision-bound excerpts.

## Capture a stack of notes

Quick Capture starts with one explicit card. **Add another note** adds a separate card; **Remove unsaved note** removes that card after confirming when it contains note text. Each saved card creates its own source note and initial To review idea. Blank cards are skipped only after an explicit confirmation showing their count. Invalid requests and failed writes do not save partial batches. A stack is limited to 100 cards per save.

- Enter inserts a newline.
- **Ctrl+Enter** saves the current stack.
- **Ctrl+Shift+Enter** saves the current stack and opens a fresh empty capture session.
- **Alt+Shift+N** opens Quick Capture when no modal is open. Ctrl+Shift+N remains the browser's private-window shortcut.

Capture batches have a stable local request ID. Retrying an unchanged stack after a lost response returns its existing notes instead of creating duplicates. If a saved stack's contents were subsequently changed in its retained draft, thoughtFork asks you to inspect the saved result rather than guessing whether to create another copy.

## Closing and recovering work

Comments continue to save after a short debounce. Every input change in comment, idea, source and capture editors synchronously records its draft in the existing local browser storage mechanism. Hiding the window requests a flush of pending ordinary idea changes; closing warns while work is unacknowledged, and also requests a best-effort flush. Capture/source/idea form text is not silently committed by Close.

Browser/Edge app mode **cannot guarantee an asynchronous save before the window closes**. A browser may suppress a close prompt, a crash can skip close events, and local storage can be disabled, full, cleared or lost with the browser profile. Storage problems are shown; copy unsaved text before closing in that case. Confirmed server saves and verified ledger backups remain the authoritative research record.

On a same-tab reload, retained editors reopen. On a new window/session, **Recover drafts from other windows…** lists retained work for explicit recovery. Close the original window first. Recovery verifies the newly stored local copy before clearing an unchanged old draft slot; an actively changed old slot is preserved. Captures are not retried automatically. Review failed/conflicting idea changes against current server values before applying. Source edits offer their own latest-text comparison. Other-window drafts can be recovered only on the same browser profile, origin and application-folder identity; a changed port is a different browser origin.

Recovery now shows identifiable session cards: Quick Capture note counts and titles/snippets, idea/source edit titles, and comment previews. Long stacks show three previews and a remaining-note count; **Inspect full retained content** reveals the rest. New browser-only draft metadata records update time, types and titles. Legacy drafts honestly show that their update time was not recorded.

Each card offers **Recover** and **Discard…**. Discard requires a content-identifying confirmation, checks that the stored session still matches the preview, and removes only that browser draft session. It does not call a ledger mutation API. Close the original window before discarding its retained session; an open editor can persist its in-memory draft again. Recovery scans automatically prune only verified-empty records with no idea drafts, retained forms or unknown payload. Old non-empty records are never age-pruned; unreadable or unrecognized content is preserved. Resolved current sessions stop leaving empty storage slots behind.

## Finding and organising

Raw Sources has its own **Source order**: newest/oldest created, recently/least recently modified and title A–Z/Z–A. Missing dates sort last in both date directions. Reader size starts at 16 px with 1.6 line spacing; A−/A+ persist locally for that notebook. Idea order is remembered separately for each view; opening an idea from a result list initially carries that list's order so navigation remains predictable.

**Recent and pinned** is a compact disclosure with recorded creation/edit/review dates and individual pinned objects. Pins and reader settings are local browser preferences. Pinning never changes disposition, confidence, compilation inclusion or source text. Missing dates are not invented.

Tags remain the existing idea tags. Editors offer autocomplete from existing/recently entered tags. New UI input deduplicates capitalization/whitespace variants and prefers an existing spelling; it does not rewrite untouched legacy tags. Review chips are clickable; the tag filter shows per-idea counts and has an explicit clear action. Raw source notes do not acquire a second tag system.

Search defaults to All; optional scopes are Ideas, Sources, Current project and Tags. Current project uses the selected project filter; with All projects selected it searches all projects. Back restores the scope, tag filter and order together with the existing context. Source-only matches still belong to sources rather than being inferred for their ideas.

**Actions…** is a keyboard-operable disclosure on ideas and source notes. Full Source also exposes editing, history, pinning and link copying directly. **Copy internal link** uses the current local origin, stable object ID and notebook-folder identity. These links navigate locally; they do not share or upload research. Clipboard failure offers a selectable link. They require the same local server/notebook and are not cloud URLs.

Browse checkboxes select ideas across pages. **Review batch…** confirms exactly how many ideas will receive a project assignment, tag addition/removal or local pin change. The server checks every selected idea's version before one atomic, backed-up organisation transaction. A conflict applies none of the batch. Disposition, merges, supersession, contradiction and trash have no bulk shortcut. Selected idea and source projects remain independent, as before.

## Undo

The last supported acknowledged idea edit/review change offers **Undo**. Source edits can also be undone as a new source revision. **Ctrl+Z** outside text fields invokes application Undo; within editors it remains normal text undo. Undo uses the original action's returned version, so any intervening change causes a safe refusal instead of overwriting newer work. Pending drafts must be resolved first. Undo does not survive a reload and is not offered for capture, bulk organisation, merges or multi-record supersession.

## Windows taskbar identity

Setup assigns an explicit per-folder AppUserModelID to each thoughtFork shortcut. Launch assigns the same identity and relaunch/icon metadata to the corresponding Edge app window, then verifies it. A second invocation focuses the window with that exact identity, while the existing server/ledger writer protection remains in charge. Other Edge windows and notebooks are not relabelled. Identity setup briefly waits for exactly one new thoughtFork app window; ambiguous windows produce an error rather than stamping an unrelated window. No resident helper or new runtime is installed.

This follows the Windows [AppUserModelID grouping mechanism](https://learn.microsoft.com/en-us/windows/win32/shell/appids) and [window relaunch properties](https://learn.microsoft.com/en-us/windows/win32/properties/props-system-appusermodel-relaunchcommand).

After updating, unpin the old WScript shortcut once, rerun Setup, and pin the refreshed thoughtFork shortcut. Old taskbar pins contain Windows-cached metadata and cannot be fixed by changing the icon alone. Moving the application requires rerunning Setup and repinning. Manual browser-mode launch remains available on systems that restrict app mode or native property access; a normal browser tab has the browser's taskbar identity. Windows shell policies and browser updates can affect grouping.

The native integration test opens real Edge with a disposable profile, verifies matching shortcut/window AppUserModelIDs and single-window repeat launch. This checks the Windows mechanism without claiming that a mocked process invocation proves pinning behavior. An interactive pinned-taskbar check and a fresh-login/reboot check should accompany platform acceptance.
