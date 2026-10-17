# Light / Dark / System appearance

Appearance is UI state only. No ledger schema, persistence behavior, source data or export format changes.

## Preference and initial paint

The labelled native Appearance selector in the header offers System, Light and Dark. New visitors use System. Explicit choices are stored under `research-ledger-appearance` in localStorage for this browser origin, independently of ledger/navigation/draft state. System resolves `prefers-color-scheme` and follows changes while open; explicit Light/Dark ignore OS changes. Storage events synchronize other tabs. Clearing the preference returns to System.

`public/appearance.js` runs synchronously in the head before styles. It reads/validates the preference and applies the resolved root theme and native `color-scheme` before the application initializes. CSS supplies an OS-aware fallback if JavaScript is unavailable. This avoids the normal wrong-palette startup flash without hiding the application. Network/browser paint behavior cannot be guaranteed absolutely.

Unavailable or full storage does not block appearance: the selection applies for the current visit, with a visible and announced non-persistence notice. Appearance writes no API requests, ledger fields, exports, navigation state or drafts. The select keeps native keyboard/touch/assistive-technology semantics and does not claim application shortcuts.

## Semantic tokens

`public/themes.css` owns both palettes: page/sidebar/surfaces, control/reader backgrounds, text hierarchy, borders, hover/selected state, primary actions, focus/selection, shadows/backdrop/preview translucency, scrollbars and semantic state colors. Component rules in `styles.css` contain no fixed color literals. Dark retains graphite rather than pure black. Light uses warm neutral off-white, white reading/card surfaces and restrained shadows. Existing geometry and information density are preserved.

Keep is green, open question amber, errors red, pending merge orange, links/actions blue, historical purple and superseded muted. Project/type/source accents remain restrained. Informational review instructions and successful project acknowledgements have presentation tones rather than being mistaken for errors. Native controls, selections and scrollbars use the resolved color scheme. Reduced-motion rules disable transitions/animations.

Coverage includes rail/drawer/header, search and candidate lists/previews, Browse/Raw Sources, Review/compilation, all application dialogs, Full Source controls/scrollers, origins/lineage/evolution/history, save/failure/conflict/warning and recovery/replacement surfaces.

## Verification and limits

Core tests exercise pre-DOM resolution, persistence/failure/invalid storage, live/legacy media listeners, cross-tab preference updates, CSS coverage and token contrast. Browser tests use synthetic ledgers, including blocked storage, opposite OS/explicit settings, delayed application initialization, actual computed contrast, scrolling, keyboard/touch, narrow screens, retained editor drafts, recovery and failed/conflicted save comparisons. Canonical synthetic bytes are unchanged in appearance-only checks; save-failure requests are intercepted, and recovery preview never commits. All existing suites remain in test commands.

Text/state token combinations tested must reach 4.5:1; focus and control borders 3:1. These checks and visual inspection are not a claim of full WCAG conformance. Browser-owned confirm/alert prompts, file pickers, title tooltips, OS chrome and some native popup details remain browser/OS controlled. Their behavior was preserved rather than replacing synchronous confirmation workflows. Screen-reader and physical-device testing across operating systems remains useful. No new runtime dependency or settings framework was added.
