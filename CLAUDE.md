# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, no-build, no-framework web app: an interactive 3D "rolodex" for browsing Star Wars comic issues in chronological order across two continuities (Legends and Canon). Pure HTML5 + CSS3 (perspective/3D transforms) + vanilla JS. There is no `package.json`, no bundler, no test suite, and no linter — the entire runtime is `index.html` + `styles.css` + `comics.js` + `app.js`.

## Running / previewing

There is no build step.

```bash
npx serve .
# or simply open index.html in a browser
```

To see a change actually working in the app (not just read the diff), use the `run` skill/pattern: launch a local server and load `index.html`.

There are no automated tests, lint, or CI config in this repo — don't invent npm scripts or test commands that don't exist. Verification is manual: load the page and check the console for `[timeline] ... out of chronological order` warnings (see below) and visually confirm rendering.

## Architecture

```
comics.js   → dataset: COMICS_DATA.{legends,canon} arrays (source of truth, authored order)
app.js      → sortAllEras() sorts each array by absolute in-universe year at load,
              then everything else (rendering, nav, input, audio/haptics) runs off that sorted data
index.html  → markup only, two <script> tags load comics.js then app.js
styles.css  → design tokens (CSS custom properties in :root) + all component styling
covers/     → cover images, referenced by a slug built from the sorted data
```

### Data model (`comics.js`)

`COMICS_DATA` has two arrays, `legends` and `canon`, each entry:

| Field | Description |
|---|---|
| `year` / `era` | In-universe date, e.g. `25793` / `"BBY"` or `0` / `"ABY"` |
| `age` | Story era grouping (e.g. "Dawn of the Jedi") — also the arc-nav rail's grouping key |
| `arc` | *(optional)* named story arc within an `age` (e.g. "Commencement") |
| `title` / `issue` | Comic title and issue number |
| `publisher`, `format`, `release` | Real-world publication metadata |
| `note` | Short synopsis |

Array order is the authored, diffable source of truth. `sortAllEras()` in `app.js` re-sorts by absolute in-universe year (`getAbsoluteYear`: BBY → negative, ABY → positive) at load time and `console.warn`s if authored order doesn't match chronological order — treat that warning as a signal that a new/edited entry's `year`/`era` needs fixing, not that the renderer is broken.

`sortAllEras()` also stamps derived fields onto each comic that the rest of the app depends on: `continuity` (`"legends"`/`"canon"`, mirrors the top-level array key), `ageIndex` (chronological rank of the comic's `age` within its continuity), and `arcIndex` (rank of its arc within that `age`). These are not present in the raw authored data — they only exist after load.

### Cover image convention (`app.js: coverSlug`)

Cover paths are derived, not stored: `covers/<continuity>/<ageIndex>-<age-slug>/<arcIndex>-<arc-or-title-slug>/<issue-slug>.jpg`, e.g. `covers/legends/003-knights-of-the-old-republic/01-commencement/1.jpg`. The numeric prefixes come from `ageIndex`/`arcIndex` so a plain file browser lists folders in story order rather than alphabetically. The sub-folder is `comic.arc` if present, otherwise the part of `title` after a `:` , otherwise the full `title`. When adding a new comic, its cover file must be placed at the path `coverSlug()` would compute — check this function before adding art. Missing/broken images fall back to a generated gradient title card (`getFallbackStyle`/`handleImageError`), so a missing cover is not a hard failure, just a visual downgrade.

### Runtime structure (`app.js`)

The file is organized in numbered `SECTION` comment blocks (search for `SECTION \d`) covering, in order: state/DOM refs → data loading/sorting → virtual-window card rendering → arc-nav (the ☰ story-arc jump menu, with search) → scrubber (the bottom series carousel) → audio/haptic feedback → touch/wheel/keyboard input with momentum → the main render loop (`animate`/`wake`, driven by `requestAnimationFrame`, only rendering a window of `WINDOW_RADIUS` cards around the current index rather than the whole dataset).

Key state to know before changing behavior:
- `currentEra` / `currentEraIndex` — which continuity (`legends`/`canon`) is active; persisted to `localStorage` (`sw-era`).
- `virtualIndex` — float position in the current era's filtered/reversed list; persisted to `localStorage` (`sw-index`). Momentum scroll, arc-nav jumps, and the scrubber all just mutate this and call `wake()`.
- `getFilteredData()` reverses `loadedData[currentEra]` — the stack renders newest-chronology-first at index 0.

### CSP

`index.html` sets a strict `Content-Security-Policy` (`default-src 'self'`, no external scripts/styles/fonts/network). The app is intentionally 100% self-contained with zero external requests — don't introduce a CDN dependency, external font, or analytics/tracking script without updating the CSP meta tag and confirming that's actually wanted.

## Conventions when editing

- Adding a comic: append to the correct array (`legends` or `canon`) in `comics.js` in the position matching its chronological year/era (authored order should already be chronological; the load-time sort/warning is a safety net, not a substitute). Then add the matching cover image at the path `coverSlug()` computes, or accept the generated fallback card.
- `renderMetaRows` builds DOM nodes via direct DOM APIs rather than `innerHTML`, because entry text (titles/notes) is hand-typed and may contain `&`/`<` — follow the same pattern for any new user-visible text pulled from `comics.js`.
- Design tokens (colors, spacing, type scale, motion easing, chrome height) live as CSS custom properties in `styles.css`'s `:root`; prefer reusing/extending those tokens over hardcoding new values. Legends vs. Canon accent color is swapped at runtime by `switchEra()` overriding `--color-accent` on the root element, not by a CSS class split.
