# Star Wars: Timeline of the Galaxy

[![Live Demo](https://img.shields.io/badge/live%20demo-hulashc.github.io-brightgreen)](https://hulashc.github.io/Star-Wars-Timeline-of-the-Galaxy/)

An interactive 3D "rolodex" for browsing Star Wars comic issues in chronological order, across both the Legends and Canon continuities — from the Dawn of the Jedi (25,793 BBY) to Marvel's *Star Wars* (0 ABY). No framework, no build step — just HTML, CSS 3D transforms, and vanilla JavaScript.

**[Try the live demo →](https://hulashc.github.io/Star-Wars-Timeline-of-the-Galaxy/)**

---

## How It Works

```
comics.js (106 curated issues, split into "legends" and "canon" arrays)
    │  sorted + verified chronologically at load time
    ▼
index.html renders each issue as a card in a 3D stack
    │  CSS perspective + transform-style: preserve-3d
    ▼
Wheel / arrow-key input drives momentum-based rotation through the stack
    │  no scroll-snap, no animation library
    ▼
Arc-nav rail lets you jump straight to a story arc (era bar → ☰)
    ▼
Issues without cover art fall back to a styled title card
    ▼
Clicking a card opens a modal with the full issue metadata
```

---

## Project Structure

```
Star-Wars-Timeline-of-the-Galaxy/
├── index.html      # Markup only
├── styles.css       # Design tokens + all styling
├── app.js           # Rolodex renderer, arc nav, and modal logic
├── comics.js        # Dual-continuity dataset (legends / canon arrays)
└── covers/          # Comic cover images referenced by the dataset
```

---

## Data Model

Each entry in `comics.js` carries:

| Field | Description |
|---|---|
| `year` / `era` | In-universe date, e.g. `25793 BBY` or `0 ABY` |
| `age` | Story era grouping, e.g. "Dawn of the Jedi", "Tales of the Jedi" — also the arc-nav rail's grouping key |
| `arc` | *(optional)* Named story arc within an `age`, e.g. "Commencement" (used by Knights of the Old Republic) |
| `title` / `issue` | Comic title and issue number |
| `publisher` | e.g. Dark Horse Comics, Marvel Comics |
| `format` | e.g. "5-issue limited series" |
| `release` | Real-world publication year |
| `note` | Short synopsis |

The dataset is split into two arrays — `legends` and `canon` — so each continuity can be styled and ordered independently while sharing the same renderer. Array order is the authored source of truth (kept readable/diffable), but `app.js` sorts each array by absolute in-universe year at load time and warns in the console if a mistyped `year`/`era` would put an entry out of order.

---

## Running Locally

No build step required.

```bash
git clone https://github.com/hulashc/Star-Wars-Timeline-of-the-Galaxy.git
cd Star-Wars-Timeline-of-the-Galaxy
npx serve .
# or simply open index.html in a browser
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling & 3D | CSS3 (perspective, `transform-style: preserve-3d`, custom properties) |
| Interaction | Vanilla JavaScript (wheel/keyboard momentum scroll, modal rendering) |
| Hosting | GitHub Pages |
