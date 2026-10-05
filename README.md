# Master Edit Suite (working title)

A dockable After Effects panel that turns a run of selected clips into a styled
edit in one click, and bundles the everyday tools an editor reaches for: presets,
sound effects, transitions, cleanup, easing, export and AI helpers.

v1 is an internal tool for the product owner's own editing. The full product
requirements are in the PRD ("After Effects Edit Suite"); this README tracks what
is built.

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 · Foundation | Panel shell, host API with one undo step per action, settings, logging, build and debug setup | **Built** |
| 1 · Core tools | Project (export, size, bin, purge), FX manager, Arrange, Audio fades and volume | **Built** |
| 2 · Library and editing aids | Library, Transitions, Balance brightness, Cuts, Ease curve editor | **Built** |
| 3 · Auto Edit | Six-step pipeline, three draft styles | **Built** |
| 4 · AI tools | Auto Captions, Dialogue, Sound Effects generator, Auto Tracker | Not started (placeholder in the panel) |

Not built on purpose: "Fix frame-blend edges" and the Watermark bundle are shown
disabled until their open questions are answered, and Advanced reverb (P2) is listed
as planned.

**Nothing has been run inside After Effects yet.** Everything is covered by
automated tests against a mock of the After Effects object model (see
[Testing](#testing)), and the panel UI has been checked in a browser. The next step
is the PRD's manual pass on the 3 reference projects. Things most likely to need
adjusting there:

- **Effect parameter indices in the recipes** (`recipes/`), written from the Effect
  Controls order without visual review: Radial Blur, Twirl, Turbulent Displace,
  Tint and Vibrance in particular. A wrong index is skipped with a warning, not a
  failure, and fixing it is a JSON edit.
- **The Exposure control** used by Balance brightness (`ADBE Exposure2-0003`, then
  index 3). If neither matches, the action stops with a clear message.
- **Look and feel of transitions, styles and grades**: all are first drafts that
  need tuning and sign-off (PRD open question).
- **Split text by word** positions on real fonts, and **Render and convert** with
  the local render templates and ffmpeg build.

## Requirements

- After Effects 2024 (24.x) or later, Windows 10/11 (macOS on Apple Silicon is a P1 follow-up)
- Node.js 20+ for building
- ffmpeg with libx264 for Render and convert (see [`bin/README.md`](bin/README.md))

## Install on Windows (installer)

`npm run installer` builds `dist/MasterEditSuite-Setup-<version>.exe` with NSIS
(`makensis` must be on the PATH). The installer needs no administrator rights: it
copies the panel to `%APPDATA%\Adobe\CEP\extensions\com.mastereditsuite.panel`,
turns on PlayerDebugMode for CSXS 11 and 12 so After Effects loads the unsigned
panel, and adds an uninstaller to Windows' Installed apps. It asks you to close
After Effects first. Uninstalling keeps your settings and logs.

The installer is not code-signed, so Windows SmartScreen shows "Windows protected
your PC" on first run: click **More info › Run anyway**. Signing is part of the
"sell it later" open question.

## Install a development build

```bash
npm install
npm run build        # -> dist/cep (panel, host script, CSXS manifest)
npm run debug-mode   # once per machine: allow unsigned extensions (CSXS 11 and 12)
npm run link         # link dist/cep into the user's CEP extensions folder
```

Restart After Effects and open **Window › Extensions › Master Edit Suite**. After
later builds, close and reopen the panel to pick up changes. With the panel open,
`http://localhost:8860` in Chrome gives remote DevTools (configured in `cep/.debug`).

## Develop without After Effects

```bash
npm run dev          # http://localhost:3000
```

In a normal browser the panel talks to a mock host (`src/panel/bridge/mockHost.ts`)
with a fake comp; the **Preview** bar at the bottom switches the selection so every
enabled and disabled state can be checked. File access (render, save frame, logs)
needs Node and is disabled in the browser.

## Commands

| Command | What it does |
| --- | --- |
| `npm run build` | Panel (Vite), host script (concatenated and ES3-checked) and manifest into `dist/cep` |
| `npm test` | All unit tests |
| `npm run typecheck` | TypeScript check of panel, Node layer and tests |
| `npm run check` | Typecheck, tests and build: run before every commit |
| `npm run link` / `npm run unlink` | Add or remove the extension link |
| `npm run installer` | Build, then package the Windows installer `.exe` (needs NSIS) |

## Architecture

```
After Effects
 ├─ CEP panel (src/panel)            React + TypeScript UI, never edits the project itself
 │   ├─ bridge/   host.ts            typed callHost(action, args) over evalScript, serialised
 │   ├─ node/                        Node layer: settings file, rotating log, ffmpeg, paths
 │   ├─ core/                        pure logic: requirements, settings schema, formatting, ffmpeg args
 │   └─ modules/                     one component per sidebar module
 └─ ExtendScript host (src/host)     every project change; ES3, concatenated to dist/cep/jsx/index.jsx
```

- **One undo step per action.** The panel calls `MES.call(action, argsJson)`.
  `src/host/02-core.jsx` opens one undo group named after the action, runs it and
  returns a JSON envelope `{ ok, result, undo, warnings }` or `{ ok: false, error }`.
- **No half-built output.** Actions register what they create with `ctx.track`;
  if the action throws, those items are removed before the undo group closes and
  the error names the failing step.
- **Any UI language.** Effects and properties are addressed by match name
  (`ADBE Effect Parade`, `ADBE Audio Levels`, …), never by display name.
- **Selection awareness.** CEP has no selection-change event, so the panel polls
  `state.get` (default every second, and on focus). Every button states its
  target ("3 layers") or why it is disabled ("Select at least one text layer").
- **Non-destructive.** Nothing of the user's is deleted: Un-precompose and Split
  text switch the original layer off instead, Tidy bin only moves items.
- **Offline and private.** Settings and logs live in `%APPDATA%\MasterEditSuite`
  (`~/Library/Application Support/MasterEditSuite` on macOS). No telemetry.
- **UXP later.** All editing logic is in the host layer, so the planned UXP port
  rewrites the UI shell only.

The PRD suggests the Bolt CEP template. The build here is a small Vite setup that
follows the same layout (React UI, ExtendScript host, Node via `--mixed-context`)
without the template's generator, so every file in the repo is ours and readable.

### Adding a host action

1. Register it in a `src/host/*.jsx` file (ES3 only: `var`, no arrow functions,
   no `forEach`/`indexOf`/`trim`/`JSON`; use the helpers in `01-util.jsx`):
   ```js
   M.register("arrange.example", {
       undo: "Example",                 // omit for read-only actions
       fn: function (args, ctx) {
           var comp = M.u.activeComp();
           var layers = M.u.selectedLayers(comp, 1);
           return { changed: layers.length };
       }
   });
   ```
2. Call it from the panel with `run("arrange.example", args, { success: (r) => … })`
   and gate the button with `needsLayers(state, rule)`.
3. Add a test in `test/host/` against the mock object model.

## Testing

- `test/host/` runs the real host bundle in a Node `vm` against `aeMock.ts`, a small
  in-memory model of the After Effects scripting API. It checks undo grouping,
  rollback on failure, and the behaviour of each tool (acceptance criteria such as
  "Volume ±3 dB on 10 keyframes shifts all 10 by exactly 3 dB").
- The build fails if the host script is not valid ES3.
- `test/core/` covers the pure panel logic and an end-to-end check that scripts
  built by the bridge survive quotes, backslashes and non-ASCII paths.
- The mock cannot prove After Effects behaviour (render queue, precompose,
  `sourceRectAtTime`, text layout). Those need the manual pass on the 3 reference
  projects that the PRD requires before each release.

## Known limits of this build

- Split text by word handles point text only (box text and text with animators are
  skipped with a reason).
- Un-precompose carries over a static transform through a parent null; keyframed
  transforms, effects, masks, opacity and time remapping on the precomp layer are
  reported, not applied.
- Render and convert, scene detection, Balance brightness and Auto Edit block After
  Effects while they run (ExtendScript is single-threaded); the panel shows a
  progress overlay, and only the ffmpeg conversion can be cancelled.
- Dragging library items onto the timeline is not supported by CEP; items are
  inserted at the playhead instead.
- Transition previews play from `<library>/transitions/previews/<id>.webm` when
  present; none are bundled yet.
