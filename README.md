# jev dev

A local-first desktop workbench for experimenting with Jev.

## Prerequisites

- Node.js 22.12+ and npm
- Rust 1.88+
- [Tauri prerequisites for your OS](https://v2.tauri.app/start/prerequisites/) (including Xcode Command Line Tools on macOS)

## Run

```sh
git clone https://github.com/donvito/jev-dev.git
cd jev-dev
npm ci
npm run desktop
```

For live requests, save a [TypeSafe API key](https://console.typesafe.ai/) in **Settings** and select **Live API**. **Demo** works without a key.

Optional browser preview:

```sh
npm run dev
```

Open <http://127.0.0.1:1420>. The browser preview is demo-only; live API requests require the desktop app.

## Build

```sh
npm run tauri -- build
```

Desktop bundles are written to `src-tauri/target/release/bundle/`. On macOS, the app is `src-tauri/target/release/bundle/macos/jev dev.app`. Distribution signing and notarization are not configured.

For a debug bundle, use `npm run tauri -- build --debug`; output goes to `src-tauri/target/debug/bundle/`.

To build only the frontend, run `npm run build`; output goes to `dist/`.
