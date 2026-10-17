# Thread View design

thoughtFork is the public product name. Earlier Research Ledger and Threadmark identifiers remain only for compatibility. The tagline is “Follow what became of an idea.” No API, format, schema version, export filename, data path or existing local-storage namespace is renamed.

## Navigation and projects

Primary destinations remain Review, Browse, Raw Sources and Compilation. Thread View is contextual: it needs a focal idea, so it is not a fifth global destination. The rail and independent section collapse preferences stay local. Active section headings carry selected values/counts; the compact filters button gains a labelled active marker. The existing always-visible context bar still names every active filter. Filters continue to apply after sections reopen.

Projects remain free-text assignments. Optional `meta.projects: string[]` records empty project names and explicit ordering, without migrating old ledgers or creating records on read. Names discovered in sources/ideas remain projects even if absent from the list. Registry order is followed, then other names alphabetically; locally pinned names appear first. Reordering works within the pinned/unpinned group. New project names are trimmed and limited to 200 characters; valid existing assignment strings are preserved exactly, including legacy spacing/length. Semantic dispositions/actions are unchanged and cannot be managed here.

Create/reorder use `/api/projects/manage` through the existing writer queue. They require the reviewed whole-ledger version, validate the complete resulting state, require a verified pre-operation backup and use the existing atomic replacement. Rename retains its existing transaction and updates the optional registry as well as every source/idea assignment. Combining with any existing category, including an empty registered one, requires explicit acknowledgement. Source text, prior history, comments, origins, relationships and merge metadata remain intact. Reorder/create do not produce pretend idea-history events. Hiding is local and allowed only for empty projects; an assignment makes the project visible again. The selected project cannot silently disappear. There is no delete, taxonomy or workspace system.

## Deriving a thread

`thread-model.js` is a pure projection, never a writer. An index records existing directed lineage edges, completed merge metadata, idea/source maps and adjacency. It rebuilds when the confirmed ledger/revision changes. The focal development family follows `refines`, `derived-from`, `supersedes` and `merged-into` in both directions, then includes one step of support, contradiction and related context. Sharing a raw source alone never creates an idea relationship. Generic context links are not recursively expanded across the corpus.

An edge retains subject, predicate, object and note. `A refines B`, `C supersedes A` and `E was merged into G` remain distinct. Completed merge metadata is explicitly distinguished from legacy merge links. The layout groups predecessors, focal idea, developments and nearby context. Position is a reading aid, not a claim of dated chronology or causation. Exact connection sentences remain visible, with all notes/connections in expandable sections and the reading pane. Branches and converging merges retain their individual records; no generated narrative declares a winning path.

The “Kept developments with no recorded replacement” list uses current Keep state and absence of recorded supersession/merge replacement. Refinement does not automatically obsolete a parent; contradiction does not change status. This list does not establish correctness or reconstruct what someone believed at a past date.

The overview renders 24 idea cards per page, eight origins per page and 40 chronology entries per page. Counts and page controls retain access to every result. The selected-node pane reads full summaries/raw text, comments, provenance/excerpts, all connections and history. Source records remain visually separate and open the unchanged Full Source reader. Titles select a node; Preview/F2 provides hover/focus/touch access; Review and Make focal idea are explicit actions. Arrow keys/Home/End move among visible overview idea nodes; ordinary Tab reaches every action. On narrow layouts the reading pane follows the overview and Back to thread overview restores practical navigation.

Traversal and cycle detection are iterative. Invalid, dangling, unknown and self links are omitted with warnings; cycles display a warning and never cause a loop or a repair. Validated ledger imports normally reject malformed records before this read-only projection sees them. No component writes corrections to the ledger.

## Threadmarks and time

A threadmark is a useful reading name for a meaningful change already in stored history, not a new ontology or duplicate event store. Chronology sorts actual recorded events and explicitly labelled known creation/merge timestamps. Before/after values and relationship notes remain inspectable. Undated links receive no invented event date. Current titles and statuses remain current throughout chronology.

There is deliberately no time slider or historical reconstruction. Existing history is partial: legacy links often have no timestamp; prior creation/provenance/relationship states may be missing; comments and some metadata edits are not event-sourced. Genuine point-in-time reconstruction would minimally require a complete, dated baseline plus timestamped complete changes (including relation removals/provenance/status/content), or deliberate versioned snapshots. This pass creates neither retroactive history nor a new persistence architecture.

## Limits

The client still loads the ledger in memory; indexing is linear in corpus plus links. Neighbourhood traversal handles connected development families, which can themselves be large. Rendering is paged, not a force-directed graph or virtual canvas. A high-degree selected node or an exceptionally long history can still produce a large reading pane; genuinely dense corpora need separate profiling. Return contexts remain the existing bounded in-memory stack; focal idea/view can resume through existing local navigation preferences, while selected detail and mode reset on reload. Browser/native dialogs retain their platform appearance. No comprehensive screen-reader or physical-device certification is claimed.

Run `npm test` and `npm run test:browser`; the latter uses existing optional Playwright/Edge QA tooling. Every mutation test uses a disposable synthetic ledger, never personal data.
