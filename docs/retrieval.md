# Retrieval and navigation design

Inspection: persistence queues verified atomic writes, version/generation checks and required backups; optional evolution fields retain the primary `source`, provenance ranges, completed merge markers and meaningful history. Existing limits (external writers, uncertain acknowledgements, browser storage and no unmerge) remain. Existing regression suites are retained.

Search uses the same case-insensitive, whitespace-normalized, all-words substring rule across global, Browse, Raw Sources, lineage and merge. Words may occur in different fields of the same record. Idea fields: title, summary, tags, comment, ID, project, type, disposition and action. Source fields: title, raw text, ID, project. Source-only matches are not promoted into idea results; open the matching source to see its contributions. This deliberately changes the old misleading source-to-all-ideas propagation. No implicit stemming, fuzzy matches, query language or AI ranking. Field evidence and snippets describe actual matches; exact IDs/titles rank first, then title, tags, summary, comment and metadata. Stable title/ID ties.

Global suggestions stay short with counts and a complete paged results view. Browse and Raw Sources are paged. Lineage and merge candidates have explicit previous/next controls and totals, so caps never hide results permanently. Results support arrows, Enter, Escape and an explicit keyboard/touch preview action; full content remains available without hover. Previews are scrollable and dismissible. Use measured normalization/query caching and bounded DOM rendering, not a search dependency.

Navigation preferences are local per ledger: sidebar/section collapse, pinned projects, sort, current view/filters/idea and list page. They are separate from durable private drafts and never written to research on load. Search jumps retain a bounded return context (query, filters, view, page, scroll, focus) with a visible Back control. Review queue changes choose the next surviving neighbor rather than restarting at the first idea. Existing saved timestamps provide recent-edited/reviewed/created sorts; unknown dates stay last. No invented visit timestamps or review scores.

Manage Projects lists the union of idea/source assignments, with local pinning and pinned-first alphabetical order. Rename is an explicit global transaction guarded by the current file version, with a required verified pre-operation backup. It changes matching idea.project and source.project together, preserves raw text, IDs, provenance, comments and existing history, and appends project-renamed history for affected ideas. Combining an existing exact-name category requires explicit acknowledgement. Fresh review, drafts and concurrent edits remain guarded; no browser-only rename.

Sidebar collapses to a labelled navigation rail on desktop. Filter sections independently disclose. Small screens use the rail plus an accessible temporary drawer, keeping filters, management, export and import reachable. Preferences do not clear active filters. Readable headings/counts, explicit active-filter summary, labelled dialogs/forms, controlled focus, native buttons, and reduced motion retain the calm graphite theme. thoughtFork is the public product name.

All mutations, benchmark corpora and browser checks use synthetic temporary ledgers. Code-only deployment and before/after SHA-256 inventories protect every existing data file. Full Source keeps its reader controls and navigation.

## Measured outcome

## Shared matcher

Six mixed queries, four rounds (24 samples), same fixture for old/new versions. Cold clears the new query cache; warm repeats the same query immediately. Timings include matching and ranking ideas and sources. The old version capped returned suggestions after ranking; the new version computes complete result sets. Matching semantics intentionally differ: the new version separates source-only hits and requires every word in the record. This is a retrieval-workload comparison, not an assertion of identical result sets.

| Ideas | Sources | Build normalized fields (ms) | Old median / p95 (ms) | New cold median / p95 (ms) | Cached median / p95 (ms) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 20 | 6.189 | 0.443 / 2.893 | 0.181 / 1.313 | 0.003 / 0.007 |
| 1000 | 200 | 15.775 | 5.922 / 8.472 | 1.194 / 2.6 | 0.005 / 0.016 |
| 5000 | 1000 | 76.206 | 58.688 / 99.39 | 6.303 / 11.321 | 0.011 / 0.036 |
| 10000 | 2000 | 198.776 | 319.13 / 369.463 | 16.66 / 33.065 | 0.02 / 0.04 |

## Browser input and rendering

Six input events per corpus/version, measured inside the actual handler through a forced layout. Median/p95 are descriptive for this small mixed-query sample, not an SLA. Browse/Raw Sources timings are single view-render samples with layout, excluding network. Initial load includes loopback load, ledger validation/envelope, JavaScript and initial view; no mutation requests are sent.

| Ideas | Version | Initial load (ms) | Browse render (ms / rows) | Input-to-layout median / p95 (ms) | Raw Sources render (ms / cards) |
| ---: | --- | ---: | ---: | ---: | ---: |
| 100 | legacy | 209.04 | 20.1 / 100 | 10 / 22 | 8.5 / 20 |
| 100 | updated | 193.32 | 15.2 / 40 | 8.2 / 18.3 | 12.9 / 20 |
| 1000 | legacy | 192.04 | 107.5 / 1000 | 88.3 / 108 | 74.8 / 200 |
| 1000 | updated | 241.4 | 15.5 / 40 | 12 / 23.7 | 14.1 / 25 |
| 5000 | legacy | 388.08 | 394.7 / 5000 | 417.5 / 561.1 | 1266.6 / 1000 |
| 5000 | updated | 487.44 | 18.3 / 40 | 16.3 / 27.1 | 17 / 25 |
| 10000 | legacy | 621.57 | 793.9 / 10000 | 1280.8 / 1869.2 | 4090 / 2000 |
| 10000 | updated | 759.18 | 18 / 40 | 22.9 / 37.8 | 14.6 / 25 |

The measurements justify caching normalized fields, ID/contribution maps, eight recent query result entries and bounded DOM lists. Browse renders 40 rows, Raw Sources 25 cards, complete search 30 records, lineage 7 candidates, merge 12 candidates and Full Source 40 contributions per page. Every list has totals, previous/next and direct page-number navigation when needed. No virtual scroller, worker, persistent search index, third-party search engine or vector database was added.

At 10,000 ideas, normalized-field construction adds a roughly 199 ms one-time cost and initial load rose from about 622 to 759 ms in this run. Repeated retrieval/rendering is substantially faster. The client still holds the full ledger and normalized searchable text in memory; memory usage, substantially larger documents, dense genealogy and other hardware need separate measurement.

Raw benchmark JSON accompanies this report. Measurements preceded the final small copy, focus and pager refinements; the installed-code 10,000-idea regression verifies full reachability and bounded rendering after those refinements. No strict wall-clock assertion is used in regression tests.

## Operating limits and interaction details

Global suggestions search the entire ledger; See all results clears idea filters with a return context, then the complete view responds to sidebar filters. Raw sources apply project/search, not idea dispositions/actions. Complete-view idea order follows the selected sort; source groups keep relevance order. Titles and matching evidence remain separate from raw-source contributions.

Navigation preferences and reading position are local per ledger/browser origin, shared across tabs on that origin (last writer wins). The return stack is bounded to 12 jumps and remains in memory; it is not browser history or a permanent bookmark system. It also restores a Full Source reader when following its contributions. Replacement generations reset stale return contexts/positions; rename clears old contexts. Pins/sections are independent of research and may be lost when browser data is cleared. Single-key shortcuts can be disabled.

Project names are case-sensitive user categories; exact existing destinations require combination acknowledgement. Renames require a current whole-file version, so even an unrelated intervening edit asks for fresh review. Required backup and canonical-write failures fail closed. A lost rename response remains uncertain; inspect confirmed assignments before retrying. No automatic project deletion, arbitrary reordering, taxonomy tree or batch review was added.

The accessibility checks cover names, native dialog/focus behavior, keyboard/touch-emulated previews, drawer focus containment, selected state, reduced motion and a representative small-text contrast calculation. They do not establish complete WCAG conformance or replace human screen-reader/device testing. Existing persistence and evolution limits still apply.
