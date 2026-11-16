# pkg-build report

## What I built
- `tools/build-web.mjs`: esbuild (`npx --yes esbuild@0.25`) bundle to `dist/web/{index.html,app.js,style.css}` plus `dist/catxzzon.html` (JS+CSS inlined, plays from `file://`). Fallback without esbuild: unbundled copy of `src/` (and no single file). Stages a patched copy of `src/` so `import(variable)` calls (main.js `tryImport`, renderer.js `imp`) resolve from a static module map; template imports are handled by esbuild.
- `tools/package-desktop.mjs`: Neutralinojs 6.10.0 (zip cached in `assets-cache/`, SHA-256 pinned; client lib 6.7.0 pinned too). Own asar writer produces `resources.neu` (web build, config, shell.js, 256px icon from `cat_portrait` via `encodePNG`). Outputs `dist/desktop/catxzzon-<ver>-{linux-x64.tar.gz,win-x64.zip,mac-x64.zip,mac-arm64.zip}` + `SHA256SUMS`. Mac gets a `CATXZZON.app`.
- `desktop/`: `neutralino.config.json` (960x540, resizable, title, icon), `shell.js` (F11 fullscreen, close exits), launchers `catxzzon.sh` (auto-falls back to browser when webkit2gtk-4.1 is missing; `--browser`), `catxzzon-browser.cmd`, `catxzzon-browser.command`, `smoke_linux.sh`, `smoke_windows.sh`.
- `.github/workflows/release.yml` (tag `v*`; checkout, setup-node, upload-artifact, `gh release create`), `docs/BUILD.md` (commands, design, Electron/Tauri size table, tradeoffs), `test/pkg-build.test.mjs` (6 tests).

## Verification evidence
- Sizes (game as of 00:12 UTC): `app.js` 229 KB / 91 KB gzip; `dist/catxzzon.html` 237 KB / 95 KB gzip. Archives: linux 1.11 MB, win 1.18 MB, mac-x64 1.03 MB, mac-arm64 0.98 MB; binaries 2.4-3.0 MB.
- `tools/smoke_web.sh $PWD/dist/catxzzon.html`: `SMOKE_WEB OK`, errors [] (screenshot viewed: the game renders HUD, cat, castle floor).
- `desktop/smoke_linux.sh` on the shipped tarball unpacked in a temp dir: browser mode serves index, app.js, shell.js, icon from `resources.neu`; window mode under Xvfb stays alive 6 s; `xwininfo` shows title "CATXZZON" at 960x540 (config is read from the asar). `SMOKE_DESKTOP OK`.
- Windows VM smoke: SKIPPED (VM unreachable; `desktop/smoke_windows.sh` prints SKIP). The script is untested against a live VM.
- macOS binaries: not runnable here; only structure checked (zip listing, Mach-O via `file`).
- `node --test test/pkg-build.test.mjs`: 6 pass. Mutation checks: removing asar 4-byte padding fails 2 tests; breaking single-file CSS inlining fails 1 test (both restored).

## Deviations from the contract
- `--version` smoke is impossible: Neutralino has no `--version` flag (it opens a window). Version is verified via pinned SHA-256 of the release zip and `binaryVersion` in config. The binary is the only exe so "headless" = browser mode over HTTP and Xvfb window mode.
- `--browser` is a flag of the launcher scripts, not of the binary (the binary's equivalent is `--mode=browser`). On Windows the exe is a GUI-subsystem binary, so use `catxzzon-browser.cmd`.
- Windows archive is a zip (exe + resources.neu are two files), not a bare `.exe`.
- No mac icon (.icns) and no code signing/notarization.
- New files outside my list: `desktop/smoke_linux.sh`, `desktop/smoke_windows.sh` (inside owned `desktop/`); `.gitignore` gained `assets-cache/`.

## Mistakes I made and how I fixed them
- Ran the Neutralino binary with `--version` to probe it: it opened a real window on the user's display (via Wayland). Stopped it; all later runs use `xvfb-run` with `GDK_BACKEND=x11` and no `WAYLAND_DISPLAY`.
- First bundle booted with missing modules because `import(variable)` is invisible to esbuild (also a second site in renderer.js, found by the smoke). Fixed with the staged module map.
- My tests initially rebuilt `dist/` and could delete `dist/catxzzon.html` under a concurrent run; they now build into temp dirs (`buildWeb({outDir})`).
- An asar-padding mutation initially passed my test (reader consistent with writer); added an alignment assertion.
- `tools/smoke_web.sh` needs an ABSOLUTE html path (relative gives ERR_INVALID_URL).

## Learnings for a future agent
- Neutralino reads `neutralino.config.json` from inside `resources.neu` (asar, root) and serves `/resources/` as the document root; `index.html` needs `__neutralino_globals.js` + `neutralino.js`. Native calls require the allow-list.
- Browser-mode smoke: stub `xdg-open` on PATH, pass `--port=N`, curl the server.
- Anyone adding `import(variable)` still works in the bundle as long as the target is a file under `src/`.

## Requests for other modules
- ui-shell (`src/main.js`) / render-scene (`renderer.js`): prefer static string imports where possible; the build rewrites `import(identifier)` calls, which depends on that exact shape.
- Orchestrator: run `desktop/smoke_windows.sh` when the VM is up before tagging a release; `tools/smoke_web.sh` should resolve its argument to an absolute path (owner: factory).
