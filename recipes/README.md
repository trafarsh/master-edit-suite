# Recipes

| Folder | Used by |
| --- | --- |
| `transitions/` | Transitions module, Auto Edit steps 3 and 4 |
| `effects/` | Auto Edit step 5 (additional effect over the edit part) |
| `looks/` | Auto Edit step 6 (grade on the CC adjustment layer) |
| `styles/` | Auto Edit styles: defaults for every step |

Effects and looks use the same recipe format as transitions; Auto Edit stretches
them over the whole edit part instead of centring them on a cut.

`transitions/*.json` are the one-click transitions. The Transitions module and Auto
Edit (steps 3 and 4) both build from them, so a recipe is written once. Adding a
bundle is adding a file: no code change.

Recipes in `<library>/transitions/*.json` are loaded too, so personal bundles can
live with the rest of the library.

## Format

```jsonc
{
  "id": "shake-flash",            // unique, used in layer tags
  "name": "Shake flash",          // shown in the panel and in the undo name
  "lengthFrames": 12,             // default length; the panel can override it
  "layers": [                     // first layer ends up on top
    {
      "type": "adjustment",       // or "solid" (with "color" and optional "blendMode")
      "name": "Shake",
      "transform": { "ADBE Opacity": <param> },     // layer transform, by match name
      "effects": [
        { "matchName": "ADBE Tile", "params": { "4": 300, "6": 1 } }  // by index or match name
      ]
    }
  ]
}
```

A `<param>` is one of:

- a static value: `300`, `[960, 540]`, or a string formula like `"{width}/2"`
- keyframes: `{ "keys": [[u, value, ease], ...], "rest": value }`
  - `u` is 0 to 1 across the transition; `0.5` is always exactly the playhead (cut) frame.
    `"c-1"` / `"c+2"` mean whole frames before / after the cut.
  - `ease` is `"smooth"` (default), `"linear"` or `"hold"`.
  - `rest` is the neutral value; intensity scales how far keys move away from it.
- an expression: `{ "expression": "..." }`

Strings may use `{start}`, `{center}`, `{end}`, `{length}`, `{intensity}`,
`{width}` and `{height}`.

Effect parameters are addressed by index (as listed in the Effect Controls panel,
counting from 1), which stays the same in every After Effects language. A parameter
that does not fit is skipped with a warning instead of failing the transition, so
recipes can be tuned safely.

## Status

The bundled recipes are first drafts written without visual review. Tune them in
After Effects on the reference projects and sign them off (PRD open question:
who designs and signs off styles). In particular, check the parameter indices
used for Radial Blur, Twirl and Turbulent Displace.

## Styles

A style sets every Auto Edit step's defaults. Adding a style is adding a file.

```jsonc
{
  "id": "hard-filmstyle",
  "name": "Hard Filmstyle",
  "steps": { "precompose": true, "effects": true, "transitionIn": true, "cuts": true, "extra": true, "cc": true },
  "velocity": { "enabled": true, "strength": 0.65, "frameBlend": "pixelMotion" },  // off | frameMix | pixelMotion
  "zoom": { "enabled": true, "amount": 18, "duration": 8, "push": 5 },             // %, frames, %
  "shake": { "enabled": true, "amplitude": 30, "frequency": 14, "decay": 6 },     // px, Hz, 1/s
  "transitionIn": { "type": "zoom-into-edit", "strength": 1 },                     // or "flash" / "none"
  "cuts": { "type": "flash", "intensity": 0.85, "duration": 6 },                   // any transition id
  "extra": { "type": "shake-and-flicker", "intensity": 0.5 },                      // effects/ id or "none"
  "cc": { "look": "hard-film", "balance": false }                                  // looks/ id
}
```

The three bundled styles are drafts; which styles ship in v1, and who signs them
off, is an open question in the PRD.
