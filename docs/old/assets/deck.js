// =============================================================
//  Deck runtime — fit-to-viewport scaling, navigation, overview
//  No dependencies. Ships as-is to GitHub Pages.
// =============================================================

const DESIGN = { w: 1280, h: 720 };

const deck = document.getElementById('deck');
const frames = [...deck.querySelectorAll('.frame')];
const counter = document.getElementById('counter');
const progressBar = document.getElementById('progressBar');
const notesBody = document.getElementById('notesBody');

let current = 0;

// ---------------------------------------------------------------
// Scale the 1280×720 design space to fit the viewport
// ---------------------------------------------------------------

const isReadingMode = () =>
  window.matchMedia('(max-width: 900px), (orientation: portrait) and (max-width: 1100px)')
    .matches;

function fit() {
  if (isReadingMode()) return;
  const k = Math.min(
    window.innerWidth / DESIGN.w,
    window.innerHeight / DESIGN.h
  );
  document.documentElement.style.setProperty('--k', String(k));
}

window.addEventListener('resize', fit, { passive: true });
fit();

// ---------------------------------------------------------------
// Track the active slide
// ---------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');

function setActive(index) {
  current = index;
  const frame = frames[index];

  counter.textContent = `${pad(index + 1)} / ${pad(frames.length)}`;
  progressBar.style.width = `${((index + 1) / frames.length) * 100}%`;

  document.body.classList.toggle('is-light', frame.dataset.theme === 'paper');

  const note = frame.querySelector('.speaker-note');
  notesBody.textContent = note ? note.textContent.trim() : '（メモなし）';

  const hash = `#${frame.id}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

// Programmatic jumps set the active slide directly; the observer must not
// overwrite it with the frames the smooth scroll passes through on the way.
let navLockUntil = 0;

const observer = new IntersectionObserver(
  (entries) => {
    if (document.body.classList.contains('overview')) return;
    if (performance.now() < navLockUntil) return;
    const visible = entries
      .filter((e) => e.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActive(frames.indexOf(visible.target));
  },
  { root: deck, threshold: [0.5, 0.75] }
);

frames.forEach((f) => observer.observe(f));

// ---------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------

function goTo(index) {
  const target = Math.max(0, Math.min(frames.length - 1, index));
  if (document.body.classList.contains('overview')) toggleOverview(false);

  // Animate single steps; jump instantly when skipping several slides.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isStep = Math.abs(target - current) <= 1;
  const behavior = isStep && !reduceMotion ? 'smooth' : 'auto';

  navLockUntil = performance.now() + (behavior === 'smooth' ? 700 : 250);
  frames[target].scrollIntoView({ behavior });
  setActive(target);
}

const next = () => goTo(current + 1);
const prev = () => goTo(current - 1);

function toggleOverview(force) {
  const on = force ?? !document.body.classList.contains('overview');
  document.body.classList.toggle('overview', on);
  if (!on) requestAnimationFrame(() => frames[current].scrollIntoView());
}

function toggleNotes(force) {
  const on = force ?? !document.body.classList.contains('notes-open');
  document.body.classList.toggle('notes-open', on);
}

document.getElementById('btnNext').addEventListener('click', next);
document.getElementById('btnPrev').addEventListener('click', prev);
document.getElementById('btnOverview').addEventListener('click', () => toggleOverview());
document.getElementById('btnNotes').addEventListener('click', () => toggleNotes());

frames.forEach((frame, i) => {
  frame.addEventListener('click', (event) => {
    if (document.body.classList.contains('overview')) {
      goTo(i);
      return;
    }
    if (event.target.closest('a')) return; // let links work normally
    next();
  });
});

// ---------------------------------------------------------------
// Touch swipe (mobile reading mode): swipe right advances,
// swipe left goes back. In slide mode (desktop / tablet landscape)
// the native horizontal scroll-snap already handles this.
// ---------------------------------------------------------------

let touchStartX = 0;
let touchStartY = 0;

deck.addEventListener(
  'touchstart',
  (event) => {
    if (!isReadingMode() || document.body.classList.contains('overview')) return;
    const t = event.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  },
  { passive: true }
);

deck.addEventListener(
  'touchend',
  (event) => {
    if (!isReadingMode() || document.body.classList.contains('overview')) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const SWIPE_THRESHOLD = 60;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) next();
      else prev();
    }
  },
  { passive: true }
);

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
    case ' ':
    case 'Enter':
      event.preventDefault();
      next();
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      event.preventDefault();
      prev();
      break;
    case 'Home':
      event.preventDefault();
      goTo(0);
      break;
    case 'End':
      event.preventDefault();
      goTo(frames.length - 1);
      break;
    case 'o':
    case 'O':
      toggleOverview();
      break;
    case 'n':
    case 'N':
      toggleNotes();
      break;
    case 'f':
    case 'F':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
      break;
    case 'Escape':
      toggleOverview(false);
      toggleNotes(false);
      break;
    default:
      break;
  }
});

// ---------------------------------------------------------------
// Deep links: open directly on #s7 etc.
// ---------------------------------------------------------------

const initial = frames.findIndex((f) => `#${f.id}` === location.hash);
if (initial > 0) {
  frames[initial].scrollIntoView();
  setActive(initial);
} else {
  setActive(0);
}
