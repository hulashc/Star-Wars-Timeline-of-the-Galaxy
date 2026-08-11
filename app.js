/* ==========================================================
   SECTION 1: DATA — loaded from comics.js via <script> tag.
   comics.js declares `var COMICS_DATA`, which — because it's a
   classic (non-module) script — attaches to `window`, making it
   visible here as a plain global. Keep both script tags as classic
   scripts (no type="module") or this breaks.
   ========================================================== */

/* ==========================================================
   SECTION 2: STATE & DOM REFS
   ========================================================== */

const WINDOW_RADIUS = window.innerWidth < 768 ? 4 : 7;
const IS_MOBILE = window.innerWidth < 768;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let loadedData = null;
const eras = ['legends', 'canon'];
let currentEraIndex = parseInt(localStorage.getItem('sw-era')) || 0;
let currentEra = eras[currentEraIndex];
let virtualIndex = parseFloat(localStorage.getItem('sw-index')) || 0;
let filteredData = [];
let cards = [];
let maxIndex = 0;
let animating = true;

const cardStack = document.getElementById('card-stack');
const infoEra = document.getElementById('info-era-pill');
const infoTitle = document.getElementById('info-title');
const infoSub = document.getElementById('info-subtitle');
const infoMeta = document.getElementById('info-meta');
const infoSummary = document.getElementById('info-summary');
const modal = document.getElementById('modal');
const modalClose = document.getElementById('modal-close');
const modalImage = document.getElementById('modal-image');
const modalEra = document.getElementById('modal-era');
const modalTitle = document.getElementById('modal-title');
const modalIssue = document.getElementById('modal-issue');
const modalMeta = document.getElementById('modal-meta');
const modalSummary = document.getElementById('modal-summary');
const arcNav = document.getElementById('arc-nav');
const arcNavList = document.getElementById('arc-nav-list');
const arcNavToggle = document.getElementById('arc-nav-toggle');

/* ==========================================================
   SECTION 3: HELPERS
   ========================================================== */

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^\w\s'-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-|-$/g, '');
}

function getAbsoluteYear(c) {
  return c.era === 'BBY' ? -c.year : c.year;
}

function getFallbackStyle(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `linear-gradient(135deg, hsl(${hue}, 55%, 14%), hsl(${(hue + 40) % 360}, 50%, 7%))`;
}

function handleImageError(img, alt) {
  if (img.dataset.fallback === 'true') return;
  img.dataset.fallback = 'true';
  img.style.display = 'none';
  const fb = document.createElement('div');
  fb.className = 'cover-fallback';
  fb.style.background = getFallbackStyle(alt);
  fb.textContent = alt;
  img.parentNode.insertBefore(fb, img);
}

function coverSlug(comic) {
  // Top-level continuity split — covers/legends/... vs covers/canon/... —
  // mirroring how comics.js itself splits COMICS_DATA into legends/canon.
  // `continuity` is stamped onto every comic in sortAllEras() at load time.
  const continuitySlug = comic.continuity;
  const ageSlug = slugify(comic.age);
  // Prefer the named story arc (e.g. Knights of the Old Republic's
  // "Commencement", "Flashpoint", ...) as the sub-folder when present —
  // covers/legends/knights-of-the-old-republic/commencement/1.jpg — matching
  // the per-arc folder convention used for Dawn of the Jedi / Tales of the Jedi.
  // Falls back to the colon-split part of the title for series without a
  // distinct `arc` field.
  const sub = comic.arc || (comic.title.includes(':') ? comic.title.split(':')[1].trim() : comic.title);
  const subSlug = slugify(sub);
  const issueSlug = slugify(comic.issue);
  return `${continuitySlug}/${ageSlug}/${subSlug}/${issueSlug}`;
}

function createCoverImage(comic, container) {
  const img = document.createElement('img');
  const slug = coverSlug(comic);
  img.src = `covers/${slug}.jpg`;
  img.alt = comic.title;
  img.loading = 'lazy';
  img.onerror = function () { handleImageError(this, comic.title); };
  container.appendChild(img);
}

// Builds the PUBLISHER / FORMAT / RELEASE / TIMELINE rows via DOM APIs
// rather than an innerHTML template — the data is static and trusted
// today, but 106 hand-typed entries means a stray "&"/"<" in a title or
// note should render as literal text instead of broken markup.
function renderMetaRows(container, comic) {
  container.textContent = '';
  const rows = [
    ['PUBLISHER', comic.publisher],
    ['FORMAT', comic.format],
    ['RELEASE', comic.release],
    ['TIMELINE', `${comic.year} ${comic.era}`],
  ];
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = label;
    row.appendChild(strong);
    row.appendChild(document.createTextNode(` · ${value}`));
    container.appendChild(row);
  });
}

/* ==========================================================
   SECTION 4: DATA LOADING + FILTERING
   ========================================================== */

function initApp() {
  loadedData = sortAllEras(COMICS_DATA);
  reapplyFilters();
  buildArcNav();
  wake();
}

// Chronological order is authored by hand in comics.js (for readable diffs),
// but enforced here at load time so a mistyped year/era can't silently ship
// a wrong timeline. Stable sort keeps issue-reading-order as the tiebreaker
// within the same year.
function sortAllEras(data) {
  const sorted = {};
  for (const era in data) {
    // `era` here is the continuity key ('legends'/'canon'), not the
    // per-comic BBY/ABY `era` field — stamp it as `continuity` so
    // coverSlug() can route to covers/legends/... vs covers/canon/...
    // without relying on ambient global state.
    data[era].forEach(c => { c.continuity = era; });
    const withKey = data[era].map((c, i) => ({ c, i, t: getAbsoluteYear(c) }));
    const ordered = [...withKey].sort((a, b) => a.t - b.t || a.i - b.i);
    ordered.forEach((entry, idx) => {
      if (entry.i !== idx) {
        console.warn(`[timeline] "${entry.c.title} ${entry.c.issue}" is out of chronological order in comics.js — check its year/era.`);
      }
    });
    sorted[era] = ordered.map(entry => entry.c);
  }
  return sorted;
}

function getFilteredData() {
  return [...loadedData[currentEra]].reverse();
}

/* ==========================================================
   SECTION 5: VIRTUAL WINDOW RENDERING
   ========================================================== */

function createCardElement(comic, index) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.index = index;

  const inner = document.createElement('div');
  inner.className = 'card-inner';
  createCoverImage(comic, inner);
  card.appendChild(inner);
  card.addEventListener('click', () => openModal(comic));
  cardStack.appendChild(card);
  return card;
}

function renderWindow() {
  const center = Math.round(virtualIndex);
  const start = Math.max(0, center - WINDOW_RADIUS);
  const end = Math.min(filteredData.length - 1, center + WINDOW_RADIUS);

  if (filteredData.length === 0) {
    cardStack.innerHTML = '';
    cards = [];
    maxIndex = 0;
    return;
  }

  const existing = new Set();
  Array.from(cardStack.children).forEach(el => {
    const idx = parseInt(el.dataset.index);
    if (idx >= start && idx <= end) {
      existing.add(idx);
    } else {
      el.remove();
    }
  });

  for (let i = start; i <= end; i++) {
    if (existing.has(i)) continue;
    createCardElement(filteredData[i], i);
  }

  const children = Array.from(cardStack.children)
    .sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index));
  children.forEach((el, i) => { el.style.zIndex = children.length - i; });
  cards = children;
  maxIndex = filteredData.length - 1;
}

function reapplyFilters() {
  filteredData = getFilteredData();
  if (virtualIndex > filteredData.length - 1) virtualIndex = 0;
  if (virtualIndex < 0) virtualIndex = 0;
  lastRenderedCenter = -1;
  // renderWindow() diffs existing cards by their numeric dataset.index, which
  // is only meaningful within one filteredData array — reusing a leftover
  // card from the previous era/filter would silently show the wrong cover
  // for the same index. Force a clean rebuild whenever the underlying data
  // changes (era switch, initial load); animate()'s frame-to-frame scrolling
  // still calls renderWindow() directly and keeps its cheap diffing.
  cardStack.innerHTML = '';
  renderWindow();
  updateInfo();
}

function currentComic() {
  const idx = Math.round(virtualIndex);
  return filteredData[idx] || null;
}

function switchEra(newIndex) {
  if (newIndex === currentEraIndex || !loadedData[eras[newIndex]]) return;
  currentEraIndex = newIndex;
  currentEra = eras[currentEraIndex];
  localStorage.setItem('sw-era', currentEraIndex);
  virtualIndex = 0;
  scrollVelocity = 0;
  cardStack.style.opacity = '0.3';
  reapplyFilters();
  updateEraBar();
  buildArcNav();
  wake(); // the freshly rebuilt cards need an animate() pass to be positioned
  requestAnimationFrame(() => { cardStack.style.opacity = ''; });
}

/* ==========================================================
   SECTION 6: INFO PANEL
   ========================================================== */

function updateInfo() {
  const c = currentComic();
  if (!c) {
    infoEra.textContent = '';
    infoTitle.textContent = 'No results';
    infoSub.textContent = '';
    infoMeta.textContent = '';
    infoSummary.textContent = 'Try adjusting your search or filter.';
    return;
  }
  infoEra.textContent = `${currentEra.toUpperCase()} · ${c.year} ${c.era}`;
  infoTitle.textContent = c.title;
  infoSub.textContent = c.issue;
  renderMetaRows(infoMeta, c);
  infoSummary.textContent = c.note;
  updateEraBar();
  updateArcNavActive(c);
}

/* ==========================================================
   SECTION 7: MODAL
   ========================================================== */

function openModal(comic) {
  animating = false;

  modalImage.innerHTML = '';
  createCoverImage(comic, modalImage);

  modalEra.textContent = `${currentEra.toUpperCase()} · ${comic.year} ${comic.era}`;
  modalTitle.textContent = comic.title;
  modalIssue.textContent = comic.issue;
  renderMetaRows(modalMeta, comic);
  modalSummary.textContent = comic.note;

  modal.classList.add('open');
}

function closeModal() {
  modal.classList.remove('open');
  animating = true;
  wake(); // the loop was fully stopped while the modal was open — restart it
}

modalClose.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(); });

/* ==========================================================
   SECTION 8: ARC NAV — lets you jump straight to a story arc
   ("age") instead of scrolling one card at a time through all
   106 issues.
   ========================================================== */

function buildArcNav() {
  arcNavList.textContent = '';
  const ascending = loadedData[currentEra]; // chronological, oldest first
  const seen = new Set();
  ascending.forEach(comic => {
    if (seen.has(comic.age)) return;
    seen.add(comic.age);

    const count = ascending.filter(c => c.age === comic.age).length;
    const first = ascending.find(c => c.age === comic.age);
    const last = [...ascending].reverse().find(c => c.age === comic.age);

    const item = document.createElement('button');
    item.className = 'arc-nav-item';
    item.dataset.age = comic.age;

    const title = document.createElement('span');
    title.className = 'arc-nav-item-title';
    title.textContent = comic.age;

    const meta = document.createElement('span');
    meta.className = 'arc-nav-item-meta';
    const yearLabel = first.year === last.year && first.era === last.era
      ? `${first.year} ${first.era}`
      : `${first.year} ${first.era} – ${last.year} ${last.era}`;
    meta.textContent = `${count} issue${count === 1 ? '' : 's'} · ${yearLabel}`;

    item.appendChild(title);
    item.appendChild(meta);
    item.addEventListener('click', () => jumpToAge(comic.age));
    arcNavList.appendChild(item);
  });
}

function jumpToAge(age) {
  const idx = filteredData.findIndex(c => c.age === age);
  if (idx === -1) return;
  virtualIndex = idx;
  scrollVelocity = 0;
  lastRenderedCenter = -1;
  renderWindow();
  updateInfo();
  wake(); // renderWindow()/updateInfo() don't position cards — animate() does
  if (IS_MOBILE) closeArcNav();
}

function updateArcNavActive(comic) {
  Array.from(arcNavList.children).forEach(el => {
    el.classList.toggle('active', comic && el.dataset.age === comic.age);
  });
}

function openArcNav() {
  arcNav.classList.add('open');
  arcNavToggle.classList.add('active');
  arcNavToggle.setAttribute('aria-expanded', 'true');
}
function closeArcNav() {
  arcNav.classList.remove('open');
  arcNavToggle.classList.remove('active');
  arcNavToggle.setAttribute('aria-expanded', 'false');
}
arcNavToggle.addEventListener('click', () => {
  arcNav.classList.contains('open') ? closeArcNav() : openArcNav();
});

/* ==========================================================
   SECTION 9: INPUT HANDLING
   ========================================================== */

let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) {}
  }
}
function audioTick() {
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  try {
    const t = audioCtx.currentTime, d = 0.04;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.value = 800;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(); osc.stop(t + d);
  } catch (e) {}
}
function hapticTick() {
  if (navigator.vibrate) { navigator.vibrate(8); return; }
  try {
    const id = 'ht-' + Date.now();
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.setAttribute('switch', '');
    inp.id = id; inp.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:1px;height:1px';
    const lbl = document.createElement('label');
    lbl.htmlFor = id; lbl.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    lbl.appendChild(inp); document.body.appendChild(lbl);
    lbl.click(); lbl.remove();
  } catch (e) { audioTick(); }
}

let scrollVelocity = 0;
let isTouching = false;
let touchAnchorY = 0;
let touchAnchorX = 0;
let touchAnchorIndex = 0;
let touchLastY = 0;
let flickVelocity = 0;
let lastHapticCenter = -1;

const TOUCH_SENSITIVITY = 0.01;
const SWIPE_THRESHOLD = 30;

window.addEventListener('wheel', (e) => {
  scrollVelocity += e.deltaY * 0.002;
  wake();
}, { passive: true });

window.addEventListener('touchstart', (e) => {
  if (e.target.closest('.info-panel') || e.target.closest('.modal-overlay') || e.target.closest('.arc-nav') || e.target.closest('.arc-nav-toggle')) return;
  initAudio();
  touchAnchorX = e.touches[0].clientX;
  touchAnchorY = e.touches[0].clientY;
  touchLastY = touchAnchorY;
  touchAnchorIndex = virtualIndex;
  isTouching = true;
  scrollVelocity = 0;
  flickVelocity = 0;
  lastHapticCenter = Math.round(virtualIndex);
  wake();
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  if (!isTouching) return;
  // Without this, a downward drag at the top of the page is interpreted by
  // the browser as a pull-to-refresh gesture instead of a rolodex scroll —
  // needs a non-passive listener to actually be able to cancel it.
  e.preventDefault();
  const x = e.touches[0].clientX;
  const y = e.touches[0].clientY;
  const deltaX = touchAnchorX - x;
  const deltaY = touchAnchorY - y;
  const frameDelta = touchLastY - y;
  touchLastY = y;

  if (Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && Math.abs(deltaX) > SWIPE_THRESHOLD) {
    if (deltaX < 0 && currentEraIndex < eras.length - 1) {
      switchEra(currentEraIndex + 1);
    } else if (deltaX > 0 && currentEraIndex > 0) {
      switchEra(currentEraIndex - 1);
    }
    isTouching = false;
    return;
  }

  virtualIndex = touchAnchorIndex + deltaY * TOUCH_SENSITIVITY;
  virtualIndex = Math.max(0, Math.min(maxIndex, virtualIndex));
  flickVelocity = flickVelocity * 0.6 + frameDelta * TOUCH_SENSITIVITY * 0.4;
  wake(); // defensive — touchstart already wakes the loop, this is a cheap no-op otherwise
  const c = Math.round(virtualIndex);
  if (c !== lastHapticCenter) { lastHapticCenter = c; hapticTick(); }
}, { passive: false }); // must be non-passive for the preventDefault() above to take effect

window.addEventListener('touchend', (e) => {
  if (!isTouching) return;
  isTouching = false;
  scrollVelocity = Math.abs(flickVelocity) > 0.03 ? flickVelocity : 0;
  flickVelocity = 0;
  wake();
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { scrollVelocity += 0.4; wake(); }
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { scrollVelocity -= 0.4; wake(); }
  if (e.key === 'e' || e.key === 'E') {
    const next = (currentEraIndex + 1) % eras.length;
    switchEra(next);
  }
  if (e.key === 'Escape' && arcNav.classList.contains('open')) closeArcNav();
});

infoEra.addEventListener('click', () => {
  const next = (currentEraIndex + 1) % eras.length;
  switchEra(next);
});

const eraLabels = document.querySelectorAll('.era-lbl');
eraLabels.forEach(lbl => {
  lbl.addEventListener('click', () => {
    const idx = parseInt(lbl.dataset.era);
    if (idx !== currentEraIndex) switchEra(idx);
  });
});

const eraYear = document.getElementById('era-year');
function updateEraBar() {
  eraLabels.forEach(l => l.classList.toggle('active', parseInt(l.dataset.era) === currentEraIndex));
  const c = currentComic();
  eraYear.textContent = c ? `${c.year} ${c.era}` : '';
}

const eraArrows = document.querySelectorAll('.era-arrow');
setTimeout(() => { eraArrows.forEach(a => a.style.opacity = '0'); }, 5000);

/* ==========================================================
   SECTION 10: ANIMATION LOOP
   ========================================================== */

let lastRenderedCenter = -1;

// The rAF loop used to run forever at 60fps, re-writing every visible card's
// transform/opacity every frame even when the deck was sitting completely
// still — pure wasted main-thread work that made real scrolling feel janky.
// `loopScheduled` lets us stop scheduling frames once idle; `wake()` (called
// from every input path that can move the deck) restarts it on demand.
let loopScheduled = false;

function wake() {
  if (loopScheduled) return;
  loopScheduled = true;
  requestAnimationFrame(animate);
}

function animate() {
  if (!animating) {
    // Modal is open: stop burning frames entirely. closeModal() wakes us back up.
    loopScheduled = false;
    return;
  }

  if (!isTouching) {
    scrollVelocity *= 0.82;
    if (Math.abs(scrollVelocity) < 0.001) scrollVelocity = 0;
    virtualIndex += scrollVelocity;
    virtualIndex = Math.max(0, Math.min(maxIndex, virtualIndex));
    const snapTarget = Math.round(virtualIndex);
    // Respect prefers-reduced-motion: snap straight to the nearest card
    // instead of easing towards it over several frames.
    virtualIndex += (snapTarget - virtualIndex) * (REDUCED_MOTION ? 1 : (IS_MOBILE ? 0.15 : 0.08));
  }

  const center = Math.round(virtualIndex);
  if (center !== lastRenderedCenter) {
    lastRenderedCenter = center;
    renderWindow();
    updateInfo();
    if (!isTouching && IS_MOBILE) {
      if (navigator.vibrate) navigator.vibrate(8);
    }
  }

  const baseTilt = -18;
  const deckSpreadZ = 28;
  const deckSpreadY = -6;

  cards.forEach(card => {
    const i = parseInt(card.dataset.index);
    const offset = i - virtualIndex;
    let rotateX, translateY, translateZ, opacity;

    if (offset < -1.2) {
      rotateX = 90; translateY = 520; translateZ = -280; opacity = 0;
    } else if (offset < 0) {
      const t = 1 + offset;
      rotateX = baseTilt + (1 - t) * 110;
      translateY = t * -24 + (1 - t) * 280;
      translateZ = t * 90 + (1 - t) * -220;
      opacity = t;
    } else {
      const depth = Math.min(offset, 6);
      translateZ = -depth * deckSpreadZ;
      translateY = depth * deckSpreadY;
      rotateX = baseTilt;
      opacity = 1 - depth * 0.12;

      if (offset < 0.5) {
        const lift = (0.5 - offset) * 2;
        translateZ += lift * 70;
        translateY -= lift * 18;
      }
    }

    card.style.transform = `rotateX(${rotateX}deg) translateZ(${translateZ}px) translateY(${translateY}px)`;
    card.style.opacity = opacity;
  });

  // scrollVelocity is hard-zeroed above once it decays below 0.001, so
  // checking it against exactly 0 here is safe, not just "small enough."
  // The 0.01 threshold matches the precision the old unconditional
  // localStorage write already used — at the 0.08/frame easing factor, a
  // much tighter epsilon (e.g. 0.0005) takes ~1s of imperceptible sub-pixel
  // settling to satisfy, which would keep the "idle" loop alive far longer
  // than any visible motion actually lasts.
  const settled = !isTouching && scrollVelocity === 0 &&
                  Math.abs(virtualIndex - Math.round(virtualIndex)) < 0.01;

  if (settled) {
    localStorage.setItem('sw-index', Math.round(virtualIndex));
    loopScheduled = false; // fully at rest — an input handler's wake() resumes us
    return;
  }

  requestAnimationFrame(animate);
}

/* ==========================================================
   SECTION 11: INIT
   ========================================================== */

cardStack.style.transition = 'opacity .35s';
initApp();
updateEraBar();
