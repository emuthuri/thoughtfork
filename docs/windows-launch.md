# Windows application launch

The usability update adds a shared native shortcut/window AppUserModelID. Rerun Setup and replace an old taskbar pin once; see [taskbar identity and platform checks](everyday-use.md#windows-taskbar-identity). The launcher now focuses only a window carrying this application's per-folder identity when launched through the installed shortcut.

thoughtFork remains a local Node/browser application. No Electron, Tauri, tray daemon, runtime package dependency, second writer or new research-persistence path is introduced.

## Normal path

Install Node.js 20+, extract the application to a stable folder and double-click **Setup thoughtFork.vbs**. Yes creates Start Menu and Desktop shortcuts; No creates Start Menu only. Setup is current-user, does not elevate, never starts a server and never accesses a notebook. Repeating setup updates the same owned shortcut names. If an unrelated shortcut already occupies the name, setup leaves it unchanged and explains the conflict.

Open **thoughtFork** from Start Menu or double-click **launch-thoughtfork.vbs**. Windows Script Host invokes Windows PowerShell with a hidden window; the launcher starts Node hidden with redirected logs. ExecutionPolicy Bypass applies only to this invocation, never a machine/user policy change. Organisations that disable Windows Script Host, PowerShell scripts or browser app mode may require the documented manual `node server.js --open` route. Do not disable organisational controls to use the launcher.

The launcher locates the project from its own script location, not the current directory. Discovery checks PATH and common per-user/system Node/Edge installations. A running healthy instance can be reused even when Node is no longer on the current PATH. A per-project Windows session mutex serializes simultaneous launches; the existing Node writer-ownership lock still protects the actual notebook across all processes/ports.

## Identity and readiness

`GET /api/health` returns only application name, launch protocol version, a normalized project-path hash, server PID and normal/recovery mode. It returns no research text or records, creates no file and does not cache. The launcher checks the identity, not merely whether any web page answers on port 4173. A healthy server for another project copy is not silently opened. Busy/foreign/older servers produce a useful error and are never killed. Startup waits up to 25 seconds for the matching endpoint; an early Node exit reports the startup diagnostic/log location.

The Windows launcher uses http://127.0.0.1:4173, preserving the application's normal local origin. Optional `-Port`, `-NoBrowser`, `-NoErrorDialog`, `-NodePath` and `-PassThru` switches on windows/launch-thoughtfork.ps1 support isolated QA/developer use; ordinary shortcuts supply none. An older server without the new health endpoint must be stopped normally once before adopting this launcher.

## Browser window

When available, Edge opens with `--app=http://127.0.0.1:4173`. The application title is thoughtFork and the canonical SVG supplies the favicon/sidebar mark. Browser metadata and manifest name/short name/description/display improve app presentation. The manifest is not a promise of offline operation: there is no service worker; the local server must be reachable. App mode uses the browser's normal profile/origin by default so existing preferences/drafts are not deliberately moved into a new profile. Browser policy, shortcut install behaviour and platform icon caching still control native taskbar details.

On repeat invocation, the launcher first attempts to restore/focus an existing Chrome_WidgetWin_1 app window with the exact thoughtFork title. Windows foreground restrictions can deny focus; reopening the app window remains safe because the server is reused. Manual developer instances on nonstandard ports can share that title; normal release use assumes the default local port. This is best-effort window activation, not a custom browser-window registry or single-instance browser shell.

If Edge is missing or cannot be started, the registered browser opens normally. To deliberately prefer a normal browser, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\launch-thoughtfork.ps1 -BrowserMode Browser
```

External HTTP(S) links are marked `_blank` with `noopener noreferrer`; the browser decides whether an out-of-scope destination becomes a normal tab/window. Internal navigation, native dialogs, shortcuts, appearance, Thread View and ordinary browser-tab use remain unchanged. There is no custom operating-system window chrome.

## New notebooks and lifecycle

Setup and launch never create, reset, migrate or repair research data. A truly absent notebook opens the existing recovery surface with **Create an empty notebook**. This prepares the existing replacement preview; explicit empty-notebook acknowledgement and confirmation are required before the existing persistence transaction creates it. Cancel leaves the file absent. A damaged existing notebook never offers this shortcut; the original recovery/import safeguards apply. No example/personal corpus is shipped or seeded.

Closing the browser window may leave the small local Node process running. Relaunch detects and reuses it. Finish pending saves/retained drafts before intentionally stopping a server. A manual terminal-started server stops with Ctrl+C. For a hidden launcher-started instance, visit `/api/health` and match its exact `pid` in Task Manager → Details before ending that node.exe process; do not stop unrelated Node processes. The launcher never does this automatically. This deliberate manual process termination is not a graceful in-app shutdown endpoint; the existing atomic save/ownership guarantees still apply, and retained browser drafts must be reviewed separately. Windows releases writer ownership when the process exits.

Logs live under `%LOCALAPPDATA%\thoughtFork\logs\<project-hash>.out.log` and `.error.log`. Oversized logs rotate once before a fresh server start. They contain startup/diagnostic output, not exported research. Removing shortcuts does not remove logs, browser state, application code or research. Moving the project requires rerunning setup; project identity and existing ledger-specific preferences may differ after moving, as before.

## Shortcut removal

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup-thoughtfork.ps1 -RemoveShortcuts
```

Only exact thoughtFork.lnk files with this launcher's ownership description, WScript target and matching launcher filename are removed from the current user's Start Menu/Desktop. No directory is recursively removed. QA overrides for shortcut directories operate only on explicitly provided folders; they do not change normal defaults. Administrator rights are not needed.

## Icons and verification

`public/icons/thoughtfork.svg` is original canonical vector artwork: a continuous thread opens into three paths, without Git-like circular commits or borrowed artwork. PNGs at 16/32/48/64/128/180/192/256/512 and a five-size Windows ICO are committed derivatives. `npm run icons:build` uses optional existing Playwright/Edge development tooling (LEDGER_PLAYWRIGHT_PATH if necessary); it adds no application dependency. Windows Vista+ ICO supports the embedded PNG layers.

`npm test` retains all persistence/evolution/retrieval/appearance/thread tests and adds health/metadata/icon checks. `npm run test:desktop` runs Windows launcher, synthetic clean-clone, disposable shortcut and browser app-mode tests with existing optional Playwright/Edge QA tooling. The tests use nondefault ports, separate browser profiles and temporary folders, never the real notebook or personal Start Menu/Desktop. Browser fallback/focus decision branches are mocked to avoid modifying the user's browser registration. A real separate Edge app window verifies the clean title, interactions and screenshots. No offline availability or comprehensive enterprise-policy/device compatibility is claimed.

If installation friction later warrants it, a signed standalone desktop binary could be considered. Native packaging is optional future work, not a prerequisite or architecture commitment.
