# jev dev

A local-first experimentation workbench for Jev, built with Svelte 5, TypeScript, Tauri 2, Rust, and SQLite. Organize questions by project, inspect complete probability distributions, and evaluate decisions against labeled examples.

## Run locally

Use Node.js 22.12 or newer, npm, Rust 1.88 or newer, and the [Tauri prerequisites for your operating system](https://v2.tauri.app/start/prerequisites/). Desktop development on macOS requires Xcode Command Line Tools. Keep the checked-in npm and Cargo lockfiles: the Rust dependencies are resolved for Rust 1.88.

```sh
npm install
npm run desktop
```

This starts Vite on port 1420 and opens the native desktop app. To explore the browser preview alone:

```sh
npm run dev
```

Open `http://127.0.0.1:1420`. The browser preview supports the demo workflow and browser-local persistence. Live requests and OS credential storage require the native app. Browser and desktop workspaces are separate.

## Connect TypeSafe

1. Obtain a TypeSafe API key from the [TypeSafe console](https://console.typesafe.ai/).
2. Open **Settings** in the native jev dev app, paste the key, and save it.
3. Saving the key enables **Live API**. A saved key also selects Live API on startup unless you explicitly chose Demo; your choice is remembered. Review the state and questions, then use **Run** or **⌘/Ctrl + Enter**. The same mode control is available in Experiments and its setup dialog.

The entered key is passed to Rust and saved in the OS credential store: macOS Keychain, Windows Credential Manager, or Linux Secret Service. The app never returns the saved key to the webview, and never stores it in SQLite or browser storage. Removing it in Settings returns the app to demo mode. Credential checks run in the background so a Keychain prompt cannot freeze workspace editing; live runs wait until the saved key is available.

Rust sends live requests directly to `POST https://api.typesafe.ai/v1/systemone`, with Bearer authentication. Requests time out after 30 seconds per attempt. Only HTTP 429 and 529 are retried, up to three times, with exponential backoff. Live requests send the selected state and questions to TypeSafe; there is no jev dev backend server.

The request and answer formats follow the [official TypeSafe API reference](https://docs.typesafe.ai/api). The native API path was verified with a fictional support ticket on September 29, 2026; the service returned `jev-1.13.0` with answers and token usage.

## Included workflows

- **Playground:** Compact interface with light, dark, and system themes; JSON-first CodeMirror editors with syntax highlighting, folding, format/copy controls, adjustable panes, and line wrapping. Edit state as text, JSON, or structured fields; build Noul, Choice, and Score questions visually or in JSON, with deterministic question-lint warnings.
- **New session:** Use **+ New session** in the sidebar to start immediately in **No project**, with empty `{}` state and questions and a cleared response. Previous drafts and run history are preserved; the selected model and execution mode stay unchanged. Use **Move to project** when ready to choose an existing project or create one; the session’s run history follows. Select **No project** in the same dialog to move it out again. Reopen drafts and saved question sets from the session-name menu.
- **Responses:** Switch between **JSON** and **Overview**. Expand individual questions or use **Expand all results** to inspect complete distributions and rubric descriptions. Score levels align with probability bars and a marker for the returned weighted score. The response pane can also expand to fill the workbench.
- **Saved question sets:** create versioned snapshots with or without a project. **⌘/Ctrl + S** saves another version. Saved versions and their run history stay together when moved.
- **Run history:** reopen any run directly from the Playground sidebar, grouped by date. Search names, models, or run IDs, edit the highlighted run directly, and switch between runs without losing edits. Changed inputs are marked Edited while original run snapshots remain intact. The selected run and edits persist after reopening. Save each executed Playground success or failure with its request, response/error, requested and resolved models, timing, and token usage when reported. Restore, fork, compare against the current draft, and export snapshots.
- **Datasets:** import JSONL, JSON arrays, and CSV, or paste rows in the JSON editor. Open datasets in a copyable, highlighted JSON view or a table; export as JSONL or start an experiment with the selected dataset.
- **Experiments:** evaluate a dataset, repeat one row 2–50 times, or compare two saved question sets. Concurrency is configurable from 1–10. Requests batch all questions for the same state. Pause/resume controls the queue; cancel stops queued work while active calls finish.
- **Metrics:** inspect per-question accuracy, Noul precision/recall/F1 and Brier score, Choice confusion matrices and per-class metrics, Score error and within-one-level rate, and repeatability statistics. Failed or missing answers are tracked separately from scored predictions.
- **Threshold lab:** use completed Noul results with boolean labels to compare automatic accuracy, coverage, review rate, false approvals, and false rejections. Boundary values go to review. Export the selected policy as JSON.
- **Exports:** download the current request as JSON or executable TypeScript, Python, and cURL examples. Code examples read `TYPESAFE_API_KEY` from the environment.

Native exports use the operating system's Save dialog and write only to the destination you select. TypeSafe documentation and API-key links open in the default browser through a command restricted to those two official destinations.

Noul displays **P(true)**; expanding it also shows **P(false) = 1 − P(true)** and both criteria. Choice and Score display the confidence returned by Jev separately from their option or level probabilities. Missing values appear as **—**, while actual zero probabilities remain **0%**. Score is interpreted relative to its rubric; its weighted result is not a precise continuous measurement.

Use the sun/moon button in the top bar to switch themes, or choose **System**, **Light**, or **Dark** in **Settings → Appearance**. Theme changes preserve editor contents and your choice is saved locally.

## Demo mode

A fresh workspace opens with a blank session in **No project** and includes fictional resume and support example projects. Without a saved API key, execution starts in demo mode. The browser preview is always demo-only. The desktop app uses the saved mode when available and defaults to Live API when a key exists. Demo responses are deterministic synthetic fixtures labeled `synthetic-demo`; they do not call TypeSafe, consume API credits, or claim to measure Jev quality. Demo token counts are unavailable. History and experiments retain their demo/live source so simulated results remain identifiable after reopening the app.

Use live results on representative labeled data when choosing a production policy.

## Dataset format

Dataset rows hold `state` plus optional `id` and `expected`; `state` accepts the same text, object, or array supported by Jev. Shared `questions` and `model` belong in experiment setup, so the same dataset can be reused across question sets. Save questions in Playground first, then select their version in the experiment. The expandable request preview shows the actual `{state, model, questions}` request for a row (and variant). Row IDs and expected labels stay local and are never included in the API request.

JSONL uses one object per line; JSON arrays are also accepted. Full API requests containing top-level `questions` or `model` are rejected with setup guidance instead of silently dropping those fields. Expected-label keys must match question IDs. Use booleans for Noul, option names for Choice, and zero-based level indexes for Score. IDs are optional and generated when omitted.

```jsonl
{"id":"ticket_001","state":{"message":"Our production integration is unavailable."},"expected":{"is_urgent":true,"department":"technical","frustration":1}}
{"id":"ticket_002","state":{"message":"Could you send this month's invoice?"},"expected":{"is_urgent":false,"department":"billing","frustration":0}}
```

CSV accepts `state` as text or JSON and labels as `expected.<question_id>` columns or an `expected` JSON object. Without a `state` column, ordinary columns and `state.<field>` columns form the state object. Quoted commas, escaped quotes, and multiline cells are supported.

```csv
id,state,expected.is_urgent,expected.department
ticket_001,Production integration is unavailable.,true,technical
ticket_002,Please send my invoice.,false,billing
```

## Persistence

The native database is `jev-agent.sqlite3` under Tauri's app data directory for `ai.jev.agent`:

| Platform | Default database path |
| --- | --- |
| macOS | `~/Library/Application Support/ai.jev.agent/jev-agent.sqlite3` |
| Windows | `%APPDATA%\ai.jev.agent\jev-agent.sqlite3` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/ai.jev.agent/jev-agent.sqlite3` |

Projects, saved question sets, datasets, drafts, and experiment task snapshots are stored as a versioned workspace JSON document. Playground runs have a separate insert-only table. SQLite triggers reject updates and deletes of run snapshots, and raw request/response JSON is retained. Restoring a run changes the editable draft, preserving the original snapshot. Moving a session changes its workspace organization; original run snapshots and their exported JSON remain unchanged.

Browser preview data uses the localStorage keys `jev-agent-workspace-v1` and `jev-agent-runs-v1`. Browser data can be removed by clearing that origin's site data. The native database stores experiment content locally and is not encrypted; API credentials are stored separately in the OS credential store.

## Validate and package

```sh
npm run check
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
```

Frontend tests cover request validation, import parsing, metrics, threshold boundaries, score-marker positioning, probability formatting, synthetic fixtures, and export behavior. Rust tests cover database persistence, immutable snapshots, failed runs, retry policy, request validation, and credential redaction.

Create a local debug bundle with embedded frontend assets:

```sh
npm run tauri build -- --debug
```

Bundles are written beneath `src-tauri/target/debug/bundle/`. On macOS, the application is `src-tauri/target/debug/bundle/macos/jev dev.app`. The local build is not configured for distribution signing or notarization.
