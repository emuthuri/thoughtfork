# Contributing to thoughtFork

Install Node.js 20+, clone the repository, and run `npm start`. No runtime dependencies need installing. See the README for Windows shortcuts and first-run notebook creation.

Run `npm test` for dependency-free regressions. Browser QA uses optional Playwright and Microsoft Edge: install Playwright in a separate development tools folder and set `LEDGER_PLAYWRIGHT_PATH` to its absolute module path, then run `npm run test:browser` and `npm run test:desktop`. The desktop suite requires Windows for launcher/shortcut checks. `LEDGER_BROWSER_CHANNEL` can select another installed Playwright Chromium channel for browser checks.

Tests use temporary synthetic notebooks. Never test against a personal ledger. Preserve raw sources, compatibility identifiers, reviewed replacement safeguards, writer ownership and backup guarantees. Add focused regression coverage for behavior changes; do not weaken existing assertions.

Describe the problem, resulting behavior and checks in your pull request. Use synthetic examples only. Do not attach real notebooks, exports, logs, browser drafts or screenshots containing personal research. Check staged files and history before pushing; ignore rules cannot remove previously committed data.
