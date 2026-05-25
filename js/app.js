'use strict';

const MONTH_ABBR = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
const MONTH_INIT = ['S','L','M','K','M','C','L','S','W','P','L','G'];
const NOW = new Date().getMonth() + 1;

const TABS = {
  all:      { label: 'Wszystkie',       filter: () => true },
  warzywa:  { label: 'Dzikie warzywa',  filter: s =>
    ['Owoce dzikie','Kwiaty jadalne','Drzewa jadalne','Rośliny wodne','Porosty'].includes(s.kategoria) ||
    (s.kategoria === 'Rośliny zielne' && s.podkategoria === 'Dzikie warzywa')
  },
  ziola:    { label: 'Zioła',           filter: s => s.podkategoria === 'Dzikie przyprawy' },
  grzyby:   { label: 'Grzyby',          filter: s => s.kategoria === 'Grzyby' || s.kategoria === 'Rośliny TRUJĄCE' },
  lecznicze:{ label: 'Część lecznicza', filter: s => s.kategoria === 'Rośliny lecznicze' },
};

const CAT_COLOR = {
  'Rośliny zielne':   '#2d6a4f',
  'Owoce dzikie':     '#ad5c00',
  'Grzyby':           '#7b4f2e',
  'Kwiaty jadalne':   '#7b3fa0',
  'Drzewa jadalne':   '#5d4037',
  'Rośliny wodne':    '#00796b',
  'Porosty':          '#546e7a',
  'Rośliny lecznicze':'#1565c0',
  'Rośliny TRUJĄCE':  '#c62828',
};

let ATLAS_DATA = [
  ...(typeof LEGACY_DATA !== 'undefined' ? LEGACY_DATA : []),
  ...(typeof AAA_DATA !== 'undefined' ? AAA_DATA : []),
  ...(typeof GRZYBY_DATA !== 'undefined' ? GRZYBY_DATA : []),
  ...(typeof ZBIOR_DATA !== 'undefined' ? ZBIOR_DATA : []),
  ...(typeof ZIOLA_DATA !== 'undefined' ? ZIOLA_DATA : []),
  ...(typeof ZIOMA2_DATA !== 'undefined' ? ZIOMA2_DATA : []),
  ...(typeof KSIAZKA1_DATA !== 'undefined' ? KSIAZKA1_DATA : []),
];

let allSpecies = [];
let currentTab = 'all';
let searchQuery = '';
let suggestIdx  = -1;
let isDashboardMode = true;
let dashboardWeather = null;
let sortMode = 'default';
let onlyInSeason = false;
const readinessScores = new Map();
const detailsCache = {};

const WIKI_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
let imgObserver = null;
let loadMoreObserver = null;
let visibleSpecies = [];
let visibleCount = 0;
const PAGE_SIZE = 20;
let jrnLat = null, jrnLng = null, jrnPhoto = null;
let activeRecognition = null;
let jrnLocMap = null, jrnLocMarker = null, jrnHistoryMap = null;
let treasureMap = null, mvMarkers = [], mvFilter = 'all', gpsMarker = null;

const $ = id => document.getElementById(id);

async function init() {
  // Jednorazowe czyszczenie kluczy wiki cache (nie dotyka pinezek ani dziennika)
  if (!localStorage.getItem('fa_wiki_cache_reset_v2')) {
    Object.keys(localStorage)
      .filter(k => k.startsWith('fa_wiki'))
      .forEach(k => localStorage.removeItem(k));
    localStorage.setItem('fa_wiki_cache_reset_v2', '1');
  }
  renderSpinner();
  try {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const legacyData = await res.json();
    allSpecies = [...legacyData, ...ATLAS_DATA];
  } catch (e) {
    renderError(e);
    return;
  }
  buildTabCounts();
  renderDashboard();
  bindTabs();
  bindSearch();
  bindToolbar();
  $('journal-open-btn')?.addEventListener('click', openJournalModal);
  renderHeroWeather();
  loadDashboardWeather();
  bindMapView();
  initHighContrast();
  bindMainLens();
  bindSeasonalBar();
  initOfflineDetection();
  initParkingRadar();
  renderFavorites();
  bindFavorites();
  bindNotificationToggle();
  checkActiveSeasonNotifications();
  setTimeout(warmImageCache, 4000); // start po 4s, by nie blokować krytycznych zasobów
}

function getFiltered() {
  const tabFn = TABS[currentTab].filter;
  const q = searchQuery.trim().toLowerCase();
  return allSpecies.filter(s => {
    if (!tabFn(s)) return false;
    if (onlyInSeason && !(NOW >= s.sezon_start && NOW <= s.sezon_koniec)) return false;
    if (!q) return true;
    return (s.nazwa_polska + s.nazwa_lacinska + s.jadalne_czesci +
            s.zastosowanie_kulinarne + s.zastosowanie_lecznicze)
           .toLowerCase().includes(q);
  });
}

function getSorted(species) {
  if (sortMode === 'alpha') {
    return [...species].sort((a, b) => a.nazwa_polska.localeCompare(b.nazwa_polska, 'pl'));
  }
  if (sortMode === 'readiness') {
    return [...species].sort((a, b) => (readinessScores.get(b.id) || 0) - (readinessScores.get(a.id) || 0));
  }
  return species;
}

function buildTabCounts() {
  Object.entries(TABS).forEach(([id, { filter }]) => {
    const el = $(`cnt-${id}`);
    if (el) el.textContent = allSpecies.filter(filter).length;
  });
}

function renderSpinner() {
  $('species-grid').innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';
}

function renderError(e) {
  $('species-grid').innerHTML = `
    <div class="empty-state">
      <span class="empty-icon">⚠️</span>
      <p>Błąd ładowania bazy danych.<br><small>${e.message}</small></p>
    </div>`;
}

function renderGrid(species) {
  const grid = $('species-grid');
  disconnectLoadMore();
  if (!species.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🔍</span>
        <p>Brak wyników dla tego zapytania.</p>
      </div>`;
    return;
  }
  visibleSpecies = getSorted(species);
  visibleCount = 0;
  grid.innerHTML = '';
  appendMoreCards();
}

function appendMoreCards() {
  const grid = $('species-grid');
  const slice = visibleSpecies.slice(visibleCount, visibleCount + PAGE_SIZE);
  if (!slice.length) return;
  const frag = document.createDocumentFragment();
  slice.forEach(s => {
    const tmp = document.createElement('div');
    tmp.innerHTML = buildCard(s);
    frag.appendChild(tmp.firstElementChild);
  });
  grid.appendChild(frag);
  visibleCount += slice.length;
  observeCardImages();
  if (visibleCount < visibleSpecies.length) {
    attachLoadMoreSentinel(grid);
  } else {
    disconnectLoadMore();
  }
}

function attachLoadMoreSentinel(grid) {
  disconnectLoadMore();
  const sentinel = document.createElement('div');
  sentinel.className = 'load-more-sentinel';
  grid.appendChild(sentinel);
  loadMoreObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) appendMoreCards();
  }, { rootMargin: '300px' });
  loadMoreObserver.observe(sentinel);
}

function disconnectLoadMore() {
  if (loadMoreObserver) { loadMoreObserver.disconnect(); loadMoreObserver = null; }
  $('species-grid')?.querySelector('.load-more-sentinel')?.remove();
}

function buildCard(s) {
  const color  = CAT_COLOR[s.kategoria] || '#2d6a4f';
  const isSeason = NOW >= s.sezon_start && NOW <= s.sezon_koniec;
  const isToxic  = s.trujace_surowe || s.kategoria === 'Rośliny TRUJĄCE';
  const isProtected = s.ochrona && s.ochrona !== 'brak';
  const isFav = getFavorites().has(String(s.id));

  const flags = [
    isSeason    ? '<span class="flag flag-season">W sezonie ✓</span>' : '',
    isToxic     ? '<span class="flag flag-toxic">⚠ Trujące</span>'   : '',
    isProtected ? '<span class="flag flag-protected">Chroniona</span>' : '',
  ].join('');

  return `
    <article class="species-card" data-id="${s.id}"
             style="--card-accent:${color}" tabindex="0" role="button"
             aria-label="${s.nazwa_polska}">
      <button class="fav-btn${isFav ? ' fav-btn--active' : ''}" data-id="${s.id}"
              aria-label="${isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}"
              title="${isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">
        ${isFav ? '★' : '☆'}
      </button>
      <div class="card-img-wrap">
        <div class="card-img-ph" aria-hidden="true"></div>
        <img class="card-img" data-latin="${s.nazwa_lacinska}" data-polish="${s.nazwa_polska}" alt="${s.nazwa_polska}">
      </div>
      <div class="card-flags">${flags}</div>
      <div class="card-body">
        <div class="card-name">${s.nazwa_polska}</div>
        <div class="card-latin">${s.nazwa_lacinska}</div>
        <div class="card-cats">
          <span class="cat-pill" style="background:${color}">${s.kategoria}</span>
          ${s.podkategoria ? `<span class="cat-pill" style="background:${color};opacity:.7">${s.podkategoria}</span>` : ''}
        </div>
        <div class="season-track" title="Sezon: ${MONTH_ABBR[s.sezon_start-1]}–${MONTH_ABBR[s.sezon_koniec-1]}">
          ${buildSeasonBar(s.sezon_start, s.sezon_koniec)}
        </div>
        <div class="card-section-label">Zbierasz</div>
        <div class="card-jadalne">${s.jadalne_czesci}</div>
        <div class="card-meta">
          <span class="meta-item"><span class="meta-icon">🌡</span>${s.min_temp_C}°C</span>
          <span class="meta-item"><span class="meta-icon">⏱</span>${s.szczyt_zbioru}</span>
          <span class="meta-item"><span class="meta-icon">📊</span>${s.trudnosc_zbioru}</span>
        </div>
      </div>
    </article>`;
}

// ── DASHBOARD REKOMENDACJI ────────────────────────────────────────────────────

function getLastCallSpecies() {
  return allSpecies.filter(s => s.sezon_koniec === NOW && NOW >= s.sezon_start);
}

function renderDashboard() {
  disconnectLoadMore();
  const lastCall = getLastCallSpecies();
  $('species-grid').innerHTML = `
    <div class="rec-section">
      <div class="rec-header">
        <span class="rec-icon">🔥</span>
        <div class="rec-titles">
          <span class="rec-title">Gorące zbiory</span>
          <span class="rec-subtitle">Gotowość ≥ 80% teraz</span>
        </div>
      </div>
      <div class="rec-grid" id="rec-hot-grid">
        <div class="rec-loading"><div class="spinner"></div></div>
      </div>
    </div>
    <div class="rec-section">
      <div class="rec-header">
        <span class="rec-icon">⏳</span>
        <div class="rec-titles">
          <span class="rec-title">Ostatni dzwonek</span>
          <span class="rec-subtitle">Sezon kończy się w tym miesiącu</span>
        </div>
      </div>
      <div class="rec-grid">
        ${lastCall.length
          ? lastCall.map(buildCard).join('')
          : '<div class="rec-empty">Brak gatunków kończących sezon w tym miesiącu.</div>'}
      </div>
    </div>`;
  observeCardImages();
}

function updateHotPicksSection(weather) {
  const hotGrid = document.getElementById('rec-hot-grid');
  if (!hotGrid) return;
  const picks = allSpecies
    .map(s => ({ s, score: calcReadiness(s, weather).total }))
    .filter(({ score }) => score >= 80)
    .sort((a, b) => b.score - a.score);
  hotGrid.innerHTML = picks.length
    ? picks.map(({ s }) => buildCard(s)).join('')
    : '<div class="rec-empty">Dziś żaden gatunek nie osiąga 80% gotowości w okolicach Poznania.</div>';
  observeCardImages();
}

async function loadDashboardWeather() {
  let lat = 52.4064, lng = 16.9252; // fallback: Poznań
  try {
    const pos = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        timeout: 4000, maximumAge: 600_000,
      })
    );
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch {}

  try {
    const weather = await fetchWeather(lat, lng);
    dashboardWeather = weather;
    allSpecies.forEach(s => readinessScores.set(s.id, calcReadiness(s, weather).total));
    renderForestWidget(weather);
    updateSsbCounts();
    refreshSsbList();
    if (isDashboardMode) {
      updateHotPicksSection(weather);
    } else if (sortMode === 'readiness') {
      renderGrid(getFiltered());
    }
  } catch {
    const frw = $('forest-readiness-widget');
    if (frw) frw.innerHTML = '<div class="frw-error">🌿 Brak danych pogodowych — sprawdź połączenie.</div>';
    if (isDashboardMode) {
      const hotGrid = document.getElementById('rec-hot-grid');
      if (hotGrid) hotGrid.innerHTML = '<div class="rec-empty">Nie można pobrać danych pogodowych.</div>';
    }
  }
}

function enterDashboard() {
  isDashboardMode = true;
  renderDashboard();
  if (dashboardWeather) updateHotPicksSection(dashboardWeather);
}

function exitDashboard() {
  isDashboardMode = false;
  renderGrid(getFiltered());
}

function buildSeasonBar(start, end) {
  return MONTH_INIT.map((_, i) => {
    const m = i + 1;
    let cls = 'seg';
    if (m >= start && m <= end) cls += ' on';
    if (m === NOW)              cls += ' now';
    return `<span class="${cls}" title="${MONTH_ABBR[i]}"></span>`;
  }).join('');
}

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === currentTab && isDashboardMode === (btn.dataset.tab === 'all' && !searchQuery.trim())) return;
      document.querySelector('.tab-btn.active')?.classList.remove('active');
      document.querySelector('.tab-btn.active')?.setAttribute('aria-selected','false');
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      currentTab = btn.dataset.tab;
      closeSuggestions();
      if (currentTab === 'all' && !searchQuery.trim()) {
        enterDashboard();
      } else {
        exitDashboard();
      }
    });
  });
}

function bindSearch() {
  const input = $('search-input');
  let searchDebounce = null;
  input.addEventListener('input', () => {
    searchQuery = input.value;
    suggestIdx  = -1;
    renderSuggestions(getSuggestions(searchQuery));
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      if (searchQuery.trim()) {
        exitDashboard();
      } else if (currentTab === 'all') {
        enterDashboard();
      } else {
        renderGrid(getFiltered());
      }
    }, 300);
  });

  input.addEventListener('keydown', e => {
    const items = $('suggestions-list').querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIdx = Math.min(suggestIdx + 1, items.length - 1);
      highlightSuggestion(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIdx = Math.max(suggestIdx - 1, -1);
      highlightSuggestion(items);
    } else if (e.key === 'Enter' && suggestIdx >= 0) {
      e.preventDefault();
      items[suggestIdx]?.click();
    } else if (e.key === 'Escape') {
      closeSuggestions();
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.hero-search-wrap') && !e.target.closest('.search-wrapper')) closeSuggestions();
  });

  $('suggestions-list').addEventListener('click', e => {
    const li = e.target.closest('li');
    if (!li) return;
    const id = Number(li.dataset.id);
    const sp = allSpecies.find(s => s.id === id);
    if (sp) { openModal(sp); closeSuggestions(); }
  });

  $('species-grid').addEventListener('click', e => {
    if (e.target.closest('.fav-btn')) return;
    const card = e.target.closest('.species-card');
    if (!card) return;
    const sp = allSpecies.find(s => s.id === Number(card.dataset.id));
    if (sp) openModal(sp);
  });

  $('species-grid').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.species-card');
      if (!card) return;
      e.preventDefault();
      const sp = allSpecies.find(s => s.id === Number(card.dataset.id));
      if (sp) openModal(sp);
    }
  });
}

function bindToolbar() {
  $('sort-select')?.addEventListener('change', e => {
    sortMode = e.target.value;
    if (isDashboardMode) exitDashboard();
    else renderGrid(getFiltered());
  });
  $('season-toggle')?.addEventListener('change', e => {
    onlyInSeason = e.target.checked;
    if (isDashboardMode) exitDashboard();
    else renderGrid(getFiltered());
  });
}

function getSuggestions(q) {
  if (!q.trim()) return [];
  const lc = q.toLowerCase();
  return allSpecies
    .filter(s => s.nazwa_polska.toLowerCase().includes(lc) ||
                 s.nazwa_lacinska.toLowerCase().includes(lc))
    .slice(0, 9);
}

function renderSuggestions(list) {
  const ul = $('suggestions-list');
  if (!list.length) { ul.innerHTML = ''; return; }
  const q = searchQuery.toLowerCase();
  ul.innerHTML = list.map(s => {
    const color = CAT_COLOR[s.kategoria] || '#2d6a4f';
    return `
      <li data-id="${s.id}" role="option">
        <div class="sug-names">
          <div class="sug-main">${highlight(s.nazwa_polska, q)}</div>
          <div class="sug-latin">${s.nazwa_lacinska}</div>
        </div>
        <span class="sug-cat" style="background:${color}">${s.podkategoria || s.kategoria}</span>
      </li>`;
  }).join('');
}

function highlight(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return text.slice(0, idx) +
    `<mark>${text.slice(idx, idx + q.length)}</mark>` +
    text.slice(idx + q.length);
}

function highlightSuggestion(items) {
  items.forEach((el, i) => el.classList.toggle('sug-focus', i === suggestIdx));
}

function closeSuggestions() {
  $('suggestions-list').innerHTML = '';
  suggestIdx = -1;
}

// ── SEZONOWY PASEK SKRÓTÓW ────────────────────────────────────────────────────

let activeSsbMode = null;

function getSsbSpecies(mode) {
  if (mode === 'hot') {
    if (dashboardWeather) {
      return allSpecies
        .filter(s => (readinessScores.get(s.id) || 0) >= 65)
        .sort((a, b) => (readinessScores.get(b.id) || 0) - (readinessScores.get(a.id) || 0))
        .slice(0, 14);
    }
    return allSpecies
      .filter(s => NOW >= s.sezon_start && NOW <= s.sezon_koniec)
      .sort((a, b) => a.nazwa_polska.localeCompare(b.nazwa_polska, 'pl'))
      .slice(0, 14);
  }
  if (mode === 'last') {
    return allSpecies
      .filter(s => s.sezon_koniec === NOW && NOW >= s.sezon_start)
      .sort((a, b) => a.nazwa_polska.localeCompare(b.nazwa_polska, 'pl'));
  }
  if (mode === 'soon') {
    return allSpecies
      .filter(s => { const d = s.sezon_start - NOW; return d >= 1 && d <= 2; })
      .sort((a, b) => a.sezon_start - b.sezon_start || a.nazwa_polska.localeCompare(b.nazwa_polska, 'pl'));
  }
  return [];
}

function getExpertTip(s, mode) {
  const jade = s.jadalne_czesci ? s.jadalne_czesci.split(',')[0].trim() : '';
  if (mode === 'hot') {
    if (s.szczyt_zbioru) return `Szczyt: ${s.szczyt_zbioru}`;
    return jade ? `Zbieraj: ${jade}` : '';
  }
  if (mode === 'last') {
    const m = MONTH_ABBR[s.sezon_koniec - 1];
    return jade ? `Ostatnia szansa · sezon do ${m}` : `Sezon kończy się w ${m}`;
  }
  if (mode === 'soon') {
    const m = MONTH_ABBR[s.sezon_start - 1];
    return jade ? `Sezon od ${m} · ${jade}` : `Sezon od ${m}`;
  }
  return '';
}

function buildSsbListHTML(mode) {
  const species = getSsbSpecies(mode);
  const titles  = { hot: '🔥 Gorące zbiory', last: '⏳ Ostatni moment', soon: '🌱 Już za chwilę' };
  if (!species.length) {
    return `<div class="slc-content"><div class="slc-empty">Brak gatunków w tej kategorii w tym miesiącu.</div></div>`;
  }
  const items = species.map(s => {
    const tip   = getExpertTip(s, mode);
    const score = readinessScores.get(s.id);
    const badge = score != null
      ? `<span class="slc-score-badge" style="color:${readinessColor(score)}">${score}%</span>` : '';
    return `
      <div class="slc-item" data-id="${s.id}">
        <div class="slc-item-info">
          <div class="slc-item-name">${s.nazwa_polska}</div>
          ${tip ? `<div class="slc-item-tip">${tip}</div>` : ''}
        </div>
        ${badge}
        <button class="slc-plus-btn" data-id="${s.id}" aria-label="Zaloguj zbiór ${s.nazwa_polska}" title="Zaloguj zbiór">+</button>
      </div>`;
  }).join('');
  return `
    <div class="slc-content">
      <div class="slc-mode-header">
        <span class="slc-mode-title">${titles[mode]}</span>
        <span class="slc-mode-count">${species.length} gatunków</span>
      </div>
      ${items}
    </div>`;
}

function updateSsbCounts() {
  ['hot', 'last', 'soon'].forEach(m => {
    const el = $(`ssb-cnt-${m}`);
    if (el) el.textContent = getSsbSpecies(m).length || '';
  });
}

function refreshSsbList() {
  if (!activeSsbMode) return;
  const container = $('seasonal-list-container');
  if (!container) return;
  container.querySelector('.slc-inner').innerHTML = buildSsbListHTML(activeSsbMode);
  bindSsbItemEvents(container);
}

function bindSsbItemEvents(container) {
  container.querySelectorAll('.slc-item').forEach(item => {
    item.addEventListener('click', e => {
      if (e.target.closest('.slc-plus-btn')) return;
      const sp = allSpecies.find(s => s.id === Number(item.dataset.id));
      if (sp) openModal(sp);
    });
  });
  container.querySelectorAll('.slc-plus-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sp = allSpecies.find(s => s.id === Number(btn.dataset.id));
      if (!sp) return;
      openModal(sp);
      setTimeout(() => {
        const jrn = document.querySelector('#modal-content .modal-journal-section');
        if (jrn) jrn.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 220);
    });
  });
}

function bindSeasonalBar() {
  const container = $('seasonal-list-container');
  if (!container) return;
  updateSsbCounts();
  document.querySelectorAll('.ssb-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode      = btn.dataset.mode;
      const wasActive = btn.classList.contains('active');
      document.querySelectorAll('.ssb-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-expanded', 'false');
      });
      if (wasActive) {
        container.classList.remove('open');
        activeSsbMode = null;
        return;
      }
      activeSsbMode = mode;
      btn.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
      container.querySelector('.slc-inner').innerHTML = buildSsbListHTML(mode);
      container.classList.add('open');
      bindSsbItemEvents(container);
    });
  });
}

// ── MAPA LEAFLET ──────────────────────────────────────────────────────────────

const PINS_KEY = 'fa_private_pins';
let leafletMap = null;

const GREEN_ICON = typeof L !== 'undefined' ? null : null; // initialised lazily

function createIcon(emoji, size = 32) {
  return L.divIcon({
    html: `<div class="map-pin" style="font-size:${size}px;line-height:1">${emoji}</div>`,
    className: '',
    iconSize:   [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor:[0, -size],
  });
}

function getPrivatePins(speciesId) {
  try {
    return JSON.parse(localStorage.getItem(PINS_KEY) || '[]')
      .filter(p => p.speciesId === speciesId);
  } catch { return []; }
}

function savePrivatePin(speciesId, lat, lng) {
  try {
    const all = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
    const pin = { speciesId, lat, lng, savedAt: Date.now() };
    all.push(pin);
    localStorage.setItem(PINS_KEY, JSON.stringify(all));
    return pin;
  } catch { return null; }
}

function removePrivatePin(speciesId, savedAt) {
  try {
    const all = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
    const next = all.filter(p => !(p.speciesId === speciesId && p.savedAt === savedAt));
    localStorage.setItem(PINS_KEY, JSON.stringify(next));
  } catch {}
}

function destroyMap() {
  if (leafletMap)    { leafletMap.remove();    leafletMap = null; }
  if (jrnLocMap)     { jrnLocMap.remove();     jrnLocMap = null; jrnLocMarker = null; }
  if (jrnHistoryMap) { jrnHistoryMap.remove(); jrnHistoryMap = null; }
  jrnLat = null; jrnLng = null;
}

function initSpeciesMap(s) {
  const el = document.getElementById('species-map');
  if (!el || typeof L === 'undefined') return;

  if (leafletMap) { leafletMap.remove(); leafletMap = null; }

  const hasCoords  = Array.isArray(s.koordinaty) && s.koordinaty.length > 0;
  const privatePins = getPrivatePins(s.id);
  const journalPins = getJournal().filter(e => e.speciesId === s.id && e.lat != null && e.lng != null);
  const center = hasCoords
    ? [s.koordinaty[0].lat, s.koordinaty[0].lng]
    : privatePins.length
      ? [privatePins[0].lat, privatePins[0].lng]
      : journalPins.length
        ? [journalPins[0].lat, journalPins[0].lng]
        : [52.23, 19.0];
  const zoom = (hasCoords || privatePins.length || journalPins.length) ? 11 : 6;

  leafletMap = L.map(el, { zoomControl: true }).setView(center, zoom);
  leafletMap.invalidateSize();

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);

  const speciesIcon = createIcon('🌿');
  if (hasCoords) {
    s.koordinaty.forEach(k => {
      L.marker([k.lat, k.lng], { icon: speciesIcon })
        .addTo(leafletMap)
        .bindPopup(`<strong>${s.nazwa_polska}</strong><br><span style="color:#637168;font-size:12px">${k.opis || ''}</span><br><a href="https://www.google.com/maps/dir/?api=1&destination=${k.lat},${k.lng}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:5px;font-size:12px;color:#1a73e8;font-weight:600;text-decoration:none">🧭 Nawiguj</a>`);
    });
    if (s.koordinaty.length > 1) {
      const bounds = s.koordinaty.map(k => [k.lat, k.lng]);
      leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }
  }

  privatePins.forEach(pin => addPrivatePinMarker(s, pin));

  journalPins.forEach(e => {
    const photoHtml = e.photo ? `<img style="width:100%;max-height:110px;object-fit:cover;border-radius:6px;display:block;margin-bottom:6px" src="${e.photo}" alt="">` : '';
    L.marker([e.lat, e.lng], { icon: createIcon('📓', 28) })
      .addTo(leafletMap)
      .bindPopup(`${photoHtml}<strong>📓 ${e.nazwaPolska}</strong><br><span style="font-size:11.5px;color:#637168">${e.data} · ${e.ilosc_g} g</span>`, { maxWidth: 220 });
  });

  setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 400);

  const hint = document.getElementById('map-click-hint');
  leafletMap.on('click', e => {
    const pin = savePrivatePin(s.id, e.latlng.lat, e.latlng.lng);
    if (!pin) return;
    addPrivatePinMarker(s, pin).openPopup();
    if (hint) hint.textContent = '📍 Miejsce zapisane!';
    setTimeout(() => { if (hint) hint.textContent = 'Kliknij mapę, aby dodać tajne miejsce zbioru'; }, 2500);
  });
}

function addPrivatePinMarker(s, pin) {
  const date   = new Date(pin.savedAt).toLocaleDateString('pl-PL');
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  const marker = L.marker([pin.lat, pin.lng], { icon: createIcon('📍') })
    .addTo(leafletMap)
    .bindPopup(`
      <div style="min-width:160px">
        <strong style="color:#1b4332">🔒 Moje miejsce</strong><br>
        <span style="font-size:12px;color:#637168">${s.nazwa_polska}</span><br>
        <span style="font-size:11px;color:#999">${date}</span><br>
        <a href="${navUrl}" target="_blank" rel="noopener noreferrer"
           style="display:block;margin-top:6px;padding:4px 10px;background:#1a73e8;color:#fff;
                  border-radius:4px;font-size:11.5px;font-weight:600;text-align:center;text-decoration:none">
          🧭 Nawiguj
        </a>
        <button class="pin-remove-btn"
                style="margin-top:5px;padding:4px 10px;background:#c62828;color:#fff;border:none;
                       border-radius:4px;font-size:11.5px;font-weight:600;cursor:pointer;width:100%">
          ✕ Usuń to miejsce
        </button>
      </div>`);

  marker.on('popupopen', () => {
    marker.getPopup().getElement()
      ?.querySelector('.pin-remove-btn')
      ?.addEventListener('click', () => {
        removePrivatePin(s.id, pin.savedAt);
        leafletMap.removeLayer(marker);
        const rw = document.getElementById('readiness-widget');
        if (rw) renderReadiness(rw, s);
      }, { once: true });
  });

  return marker;
}

// ── DZIENNIK — LOKALIZACJA ───────────────────────────────────────────────────

function initJrnLocMap() {
  const el = document.getElementById('jrn-loc-map');
  if (!el || typeof L === 'undefined') return;
  if (jrnLocMap) { jrnLocMap.remove(); jrnLocMap = null; jrnLocMarker = null; }
  const center = (jrnLat != null && jrnLng != null) ? [jrnLat, jrnLng] : [52.23, 19.0];
  const zoom   = (jrnLat != null && jrnLng != null) ? 13 : 6;
  jrnLocMap = L.map(el, { zoomControl: true }).setView(center, zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(jrnLocMap);
  if (jrnLat != null && jrnLng != null) setJrnMapMarker(jrnLat, jrnLng);
  jrnLocMap.on('click', e => {
    jrnLat = e.latlng.lat;
    jrnLng = e.latlng.lng;
    setJrnMapMarker(jrnLat, jrnLng);
    updateJrnLocInfo();
  });
  setTimeout(() => { if (jrnLocMap) jrnLocMap.invalidateSize(); }, 300);
}

function setJrnMapMarker(lat, lng) {
  if (!jrnLocMap) return;
  if (jrnLocMarker) { jrnLocMap.removeLayer(jrnLocMarker); jrnLocMarker = null; }
  jrnLocMarker = L.marker([lat, lng], { icon: createIcon('📓') }).addTo(jrnLocMap);
  jrnLocMap.setView([lat, lng], Math.max(jrnLocMap.getZoom(), 13));
}

function updateJrnLocInfo() {
  const el = $('jrn-loc-info');
  if (!el) return;
  if (jrnLat != null && jrnLng != null) {
    el.textContent = `📍 ${jrnLat.toFixed(4)}°N, ${jrnLng.toFixed(4)}°E`;
    el.classList.add('jrn-loc-set');
  } else {
    el.textContent = 'Brak lokalizacji';
    el.classList.remove('jrn-loc-set');
  }
}

function initJrnHistoryMap(entries) {
  const el = document.getElementById('jrnl-history-map');
  if (!el || typeof L === 'undefined') return;
  if (jrnHistoryMap) { jrnHistoryMap.remove(); jrnHistoryMap = null; }
  jrnHistoryMap = L.map(el, { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(jrnHistoryMap);
  const bounds = [];
  entries.forEach(e => {
    const photoHtml = e.photo ? `<img style="width:100%;max-height:110px;object-fit:cover;border-radius:6px;display:block;margin-bottom:6px" src="${e.photo}" alt="">` : '';
    L.marker([e.lat, e.lng], { icon: createIcon('📓', 28) })
      .addTo(jrnHistoryMap)
      .bindPopup(`${photoHtml}<strong>${e.nazwaPolska}</strong><br><span style="font-size:11.5px;color:#637168">${e.data} · ${e.ilosc_g} g</span>`, { maxWidth: 220 });
    bounds.push([e.lat, e.lng]);
  });
  if (bounds.length === 1) jrnHistoryMap.setView(bounds[0], 12);
  else if (bounds.length > 1) jrnHistoryMap.fitBounds(bounds, { padding: [30, 30] });
  setTimeout(() => { if (jrnHistoryMap) jrnHistoryMap.invalidateSize(); }, 300);
}

// ── DZIENNIK ZBIORÓW ─────────────────────────────────────────────────────────

const JOURNAL_KEY = 'forest_harvest_journal';

function getJournal() {
  try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'); }
  catch { return []; }
}

function saveJournalEntry(speciesId, nazwaPolska, data, ilosc_g, notatki, lat = null, lng = null, photo = null) {
  try {
    const entries = getJournal();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      speciesId,
      nazwaPolska,
      data,
      ilosc_g: Number(ilosc_g),
      notatki: notatki.trim(),
      savedAt: Date.now(),
    };
    if (lat != null && lng != null) { entry.lat = lat; entry.lng = lng; }
    if (photo) entry.photo = photo;
    entries.unshift(entry);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
    return entry;
  } catch { return null; }
}

function deleteJournalEntry(id) {
  try {
    const entries = getJournal().filter(e => e.id !== id);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
  } catch {}
}

function compressPhoto(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 800;
        const scale = img.width > MAX_W ? MAX_W / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function buildJournalEntryHTML(e) {
  const photoHtml = e.photo
    ? `<img class="jrnl-entry-photo" src="${e.photo}" alt="Zdjęcie zbioru">` : '';
  const notesHtml = e.notatki
    ? `<div class="jrnl-entry-notes">${e.notatki}</div>` : '';
  const locHtml = (e.lat != null && e.lng != null)
    ? `<a class="jrnl-chip jrnl-chip-loc" href="https://www.google.com/maps?q=${e.lat},${e.lng}" target="_blank" rel="noopener noreferrer">📍 ${e.lat.toFixed(3)}°, ${e.lng.toFixed(3)}°</a>`
    : '';
  return `
    <div class="jrnl-entry">
      ${photoHtml}
      <div class="jrnl-entry-main">
        <div class="jrnl-entry-name">${e.nazwaPolska}</div>
        <div class="jrnl-entry-meta">
          <span class="jrnl-chip">📅 ${e.data}</span>
          <span class="jrnl-chip">⚖️ ${e.ilosc_g} g</span>
          ${locHtml}
        </div>
        ${notesHtml}
      </div>
      <button class="jrnl-delete-btn" data-id="${e.id}" aria-label="Usuń wpis">✕</button>
    </div>`;
}

function renderJournalModal() {
  const content    = $('journal-modal-content');
  const entries    = getJournal();
  const totalG     = entries.reduce((s, e) => s + (e.ilosc_g || 0), 0);
  const countTxt   = entries.length === 1 ? '1 wpis' : entries.length < 5 ? `${entries.length} wpisy` : `${entries.length} wpisów`;
  const locEntries = entries.filter(e => e.lat != null && e.lng != null);

  if (jrnHistoryMap) { jrnHistoryMap.remove(); jrnHistoryMap = null; }

  content.innerHTML = `
    <div class="jrnl-header">
      <button class="modal-close" id="journal-close-btn" aria-label="Zamknij">✕</button>
      <div class="jrnl-title">📓 Dziennik zbiorów</div>
      ${entries.length > 0
        ? `<div class="jrnl-stats">${countTxt} · łącznie <strong>${totalG} g</strong></div>`
        : '<div class="jrnl-stats">Brak wpisów</div>'}
    </div>
    ${locEntries.length ? `
    <div class="jrnl-history-map-wrap">
      <div class="jrnl-history-map-title">Mapa moich zbiorów</div>
      <div id="jrnl-history-map"></div>
    </div>` : ''}
    <div class="jrnl-list">
      ${entries.length === 0
        ? `<div class="jrnl-empty">
             <span class="jrnl-empty-icon">🌿</span>
             <p>Zanotuj swój pierwszy zbiór otwierając dowolny gatunek.</p>
           </div>`
        : entries.map(buildJournalEntryHTML).join('')}
    </div>
    <div class="jrnl-backup">
      <div class="jrnl-backup-header">
        <span class="jrnl-backup-title">Kopia zapasowa</span>
        <span class="jrnl-backup-desc">dziennik + prywatne pinezki GPS</span>
      </div>
      <div class="jrnl-backup-btns">
        <button class="jrnl-backup-btn" id="jrnl-export-btn">⬇ Eksportuj</button>
        <button class="jrnl-backup-btn" id="jrnl-import-btn">⬆ Importuj</button>
      </div>
      <div class="jrnl-backup-msg" id="jrnl-backup-msg"></div>
    </div>`;

  $('journal-close-btn')?.addEventListener('click', () => $('journal-modal').close());
  $('jrnl-export-btn')?.addEventListener('click', exportBackup);
  $('jrnl-import-btn')?.addEventListener('click', importBackup);

  content.querySelectorAll('.jrnl-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteJournalEntry(btn.dataset.id);
      renderJournalModal();
    });
  });

  if (locEntries.length) {
    requestAnimationFrame(() => initJrnHistoryMap(locEntries));
  }
}

function openJournalModal() {
  const modal = $('journal-modal');
  renderJournalModal();
  if (!modal.open) {
    modal.showModal();
    const onBackdropClick = e => { if (e.target === modal) modal.close(); };
    modal.addEventListener('click', onBackdropClick);
    modal.addEventListener('close', () => {
      modal.removeEventListener('click', onBackdropClick);
      if (jrnHistoryMap) { jrnHistoryMap.remove(); jrnHistoryMap = null; }
    }, { once: true });
  }
}

// ── OPEN-METEO WEATHER API ────────────────────────────────────────────────────

const WEATHER_CACHE_TTL = 30 * 60 * 1000;

async function fetchWeather(lat, lng) {
  const key = `fa_wx_${lat.toFixed(2)}_${lng.toFixed(2)}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (cached && Date.now() - cached.ts < WEATHER_CACHE_TTL) return cached.data;
  } catch {}
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
    `&current=temperature_2m,relative_humidity_2m,precipitation,weather_code` +
    `&daily=temperature_2m_min,temperature_2m_max,precipitation_sum,weather_code` +
    `&timezone=Europe%2FWarsaw&past_days=7&forecast_days=4`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json();
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  return data;
}

// ── WIKIPEDIA API ─────────────────────────────────────────────────────────────

async function fetchWikiImage(latinName, polishName = null) {
  // fa_wiki2_* — nowy klucz wymusza odświeżenie cache po dodaniu fallbacku polskiego
  const cacheKey = `fa_wiki2_${latinName}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.ts < WIKI_CACHE_TTL) return cached.url;
  } catch {}

  async function queryWiki(lang, title) {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=400&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const page = Object.values(data.query?.pages || {})[0];
    return page?.thumbnail?.source?.replace(/^http:\/\//, 'https://') || null;
  }

  try {
    // Krok 1: angielska Wikipedia po nazwie łacińskiej
    let imgUrl = await queryWiki('en', latinName);

    // Krok 2: fallback — polska Wikipedia po polskiej nazwie gatunku
    // Normalizacja: pierwsza litera wielka, reszta mała (wymóg API pl.wiki)
    if (!imgUrl && polishName) {
      const normalizedPolish = polishName.charAt(0).toUpperCase() + polishName.slice(1).toLowerCase();
      imgUrl = await queryWiki('pl', normalizedPolish);
    }

    if (!imgUrl) {
      console.log(`[Forest] Brak grafiki w Wikipedii: "${latinName}"${polishName ? ` / "${polishName}"` : ''}`);
    }

    try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), url: imgUrl })); } catch {}
    return imgUrl;
  } catch { return null; }
}

function initImgObserver() {
  if (imgObserver) return;
  imgObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      imgObserver.unobserve(img);
      const latin = img.dataset.latin;
      if (!latin) return;
      const polish = img.dataset.polish || null;
      fetchWikiImage(latin, polish).then(url => {
        if (!url) return;
        img.src = url;
        img.onload = () => img.classList.add('loaded');
      });
    });
  }, { rootMargin: '200px' });
}

function observeCardImages() {
  initImgObserver();
  document.querySelectorAll('.card-img[data-latin]').forEach(img => {
    if (!img.getAttribute('src')) imgObserver.observe(img);
  });
}

// ── HERO WEATHER ─────────────────────────────────────────────────────────────

function heroWeatherMoodText(code, temp) {
  if (code === 0 || code === 1) {
    if (temp >= 20) return 'Słońce i ciepło — idealny dzień na las!';
    if (temp >= 12) return 'Słonecznie i przyjemnie w lesie.';
    return 'Słonecznie, ale chłodnawo — weź kurtkę!';
  }
  if (code <= 3)  return 'Zmienne chmury — dobry dzień na zbieranie.';
  if (code <= 48) return 'Mgliście — las wygląda tajemniczo!';
  if (code <= 55) return 'Mżawka — grzyby docenią wilgoć.';
  if (code <= 67) return 'Deszczowo — grzyby właśnie rosną!';
  if (code <= 77) return 'Śnieg — las wygląda bajkowo.';
  if (code <= 82) return 'Przelotne opady — las się odświeża.';
  return 'Burza — zaplanuj wyjście na inny dzień.';
}

async function renderHeroWeather() {
  const el = document.getElementById('hero-weather');
  if (!el) return;
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude=52.4064&longitude=16.9252' +
      '&current=temperature_2m,weather_code' +
      '&timezone=Europe%2FWarsaw'
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data  = await res.json();
    const temp  = Math.round(data.current.temperature_2m);
    const code  = data.current.weather_code;
    const emoji = weatherCodeToEmoji(code);
    const h     = new Date().getHours();
    const greeting = h < 6 ? 'Dobranoc' : h < 12 ? 'Dzień dobry' : h < 18 ? 'Dobry dzień' : 'Dobry wieczór';
    el.innerHTML = `
      <div class="hww-top">
        <span class="hww-emoji">${emoji}</span>
        <span class="hww-temp">${temp}°C</span>
      </div>
      <div class="hww-greeting">${greeting}!</div>
      <div class="hww-msg">${heroWeatherMoodText(code, temp)}</div>`;
  } catch {
    el.innerHTML = '<div class="hww-offline">🌿 Poznań</div>';
  }
}

function getForestComment(score, temp, month) {
  if (score >= 80) {
    if ([8, 9, 10].includes(month)) return 'Złoty sezon grzybów i owoców leśnych!';
    if ([5, 6].includes(month))     return 'Szczyt sezonu wiosenno-letniego — zbierać!';
    if (temp >= 18)                 return 'Idealne warunki — las w pełni sił!';
    return 'Doskonała gotowość lasu — wyruszyć!';
  }
  if (score >= 60) {
    if ([7, 8].includes(month)) return 'Letnia aktywność lasu — grzyby po deszczach.';
    if ([4, 5].includes(month)) return 'Wiosna budzi las — dobry czas na wyjście.';
    return 'Dobra aktywność lasu. Warto sprawdzić.';
  }
  if (score >= 40) {
    if (temp < 5) return 'Chłodnawo — aktywne tylko mroźne specjalności.';
    return 'Umiarkowane warunki. Sprawdź lokalnie przed wyjściem.';
  }
  if (score >= 20) {
    if ([12, 1, 2].includes(month)) return 'Zima w lesie — bardzo mała aktywność.';
    return 'Susza w ściółce — niska aktywność grzybów i roślin.';
  }
  if ([12, 1, 2].includes(month)) return 'Las odpoczywa — prawie żaden gatunek nie jest aktywny.';
  return 'Niska gotowość lasu. Poczekaj na lepsze warunki.';
}

function renderForestWidget(weather) {
  const el = $('forest-readiness-widget');
  if (!el) return;

  const inSeasonSpecies = allSpecies.filter(
    s => NOW >= (s.sezon_start || 1) && NOW <= (s.sezon_koniec || 12)
  );
  const avgScore = inSeasonSpecies.length
    ? Math.round(
        inSeasonSpecies.reduce((sum, s) => sum + (readinessScores.get(s.id) || 0), 0) /
        inSeasonSpecies.length
      )
    : 0;

  const temp    = Math.round(+(weather.current?.temperature_2m ?? 0));
  const rh      = Math.round(+(weather.current?.relative_humidity_2m ?? 0));
  const color   = readinessColor(avgScore);
  const comment = getForestComment(avgScore, temp, NOW);

  el.classList.remove('frw-loading');
  el.innerHTML = `
    <div class="frw-top">
      <span class="frw-label">🌳 Ogólna Gotowość Lasu</span>
      <span class="frw-pct" style="color:${color}">${avgScore}<span class="frw-pct-unit">%</span></span>
    </div>
    <div class="frw-bar-bg">
      <div class="frw-bar-fill" style="width:${avgScore}%;background:${color}"></div>
    </div>
    <div class="frw-comment">${comment}</div>
    <div class="frw-meta">
      <span class="frw-chip">🌡️ ${temp}°C</span>
      <span class="frw-chip">💧 ${rh}% RH</span>
      <span class="frw-chip">📅 ${MONTH_ABBR[NOW - 1]}</span>
      <span class="frw-chip">🌿 ${inSeasonSpecies.length} gat. w sezonie</span>
    </div>`;
}

function getBestCoords(s) {
  const pins = getPrivatePins(s.id);
  if (pins.length) return { lat: pins[0].lat, lng: pins[0].lng, source: 'pin' };
  if (Array.isArray(s.koordinaty) && s.koordinaty.length)
    return { lat: s.koordinaty[0].lat, lng: s.koordinaty[0].lng, source: 'atlas' };
  return null;
}

// ── WSPÓŁCZYNNIK GOTOWOŚCI ────────────────────────────────────────────────────

const HUMIDITY_REQ = {
  'bardzo wysoka': { optimal: 80, ok: 65 },
  'wysoka':        { optimal: 65, ok: 48 },
  'srednia':       { optimal: 55, ok: 35 },
  'niska':         { optimal: 40, ok: 20 },
};

function calcReadiness(s, weather) {
  const cur   = weather.current;
  const daily = weather.daily;

  // Fallbacks — guard against missing / malformed JSON fields
  const minTemp = typeof s.min_temp_C === 'number' ? s.min_temp_C : 10;
  const dniMin  = typeof s.dni_min_temp === 'number' ? s.dni_min_temp : 7;
  // Normalize wilgotnosc: remove stray spaces, lowercase
  const wilKey  = String(s.wilgotnosc || 'srednia').replace(/\s+/g, '').toLowerCase();

  const inSeason    = NOW >= (s.sezon_start || 1) && NOW <= (s.sezon_koniec || 12);
  const seasonScore = inSeason ? 100 : 0;

  const minTemps  = (daily.temperature_2m_min || []).slice(0, 7);
  const daysOk    = minTemps.filter(t => t >= minTemp).length;
  const tempScore = Math.min(daysOk / Math.max(dniMin, 1), 1) * 100;

  const rh  = cur.relative_humidity_2m ?? 60;
  const req = HUMIDITY_REQ[wilKey] || HUMIDITY_REQ['srednia'];
  let humScore;
  if (rh >= req.optimal)     humScore = 100;
  else if (rh >= req.ok)     humScore = 50 + ((rh - req.ok) / (req.optimal - req.ok)) * 50;
  else                       humScore = Math.max(0, (rh / req.ok) * 50);

  const precip3 = (daily.precipitation_sum || []).slice(4, 7);
  const rainSum = precip3.reduce((a, b) => a + (b || 0), 0);
  let rainScore;
  const wil = wilKey;
  if (wil === 'bardzo wysoka' || wil === 'wysoka') {
    rainScore = Math.min(rainSum / 12, 1) * 100;
  } else if (wil === 'niska') {
    rainScore = rainSum < 3 ? 100 : Math.max(0, 100 - (rainSum - 3) * 15);
  } else {
    rainScore = (rainSum >= 2 && rainSum <= 25) ? 100
              : rainSum < 2 ? (rainSum / 2) * 100
              : Math.max(0, 100 - (rainSum - 25) * 4);
  }

  const rawTotal = Math.min(100, Math.max(0, Math.round(
    seasonScore * 0.25 +
    tempScore   * 0.40 +
    humScore    * 0.25 +
    rainScore   * 0.10
  )));
  // Poza sezonem: max 5% (anomalie fenologiczne), nie pokazujemy fałszywej gotowości
  const total = inSeason ? rawTotal : Math.min(rawTotal, 5);

  return {
    total,
    factors: {
      season:   { score: Math.round(seasonScore), label: 'Sezon',       weight: 25, icon: '📅' },
      temp:     { score: Math.round(tempScore),   label: 'Temperatura', weight: 40, icon: '🌡️' },
      humidity: { score: Math.round(humScore),    label: 'Wilgotność',  weight: 25, icon: '💧' },
      rain:     { score: Math.round(rainScore),   label: 'Opady',       weight: 10, icon: '🌧️' },
    },
    current: { temp: cur.temperature_2m ?? 0, rh: cur.relative_humidity_2m ?? 0, daysOk, rainSum: rainSum.toFixed(1) },
  };
}

function readinessColor(score) {
  if (score >= 75) return '#2d6a4f';
  if (score >= 50) return '#e65100';
  if (score >= 25) return '#f57c00';
  return '#c62828';
}

function buildReadinessGauge(score) {
  const r     = 42;
  const circ  = 2 * Math.PI * r;
  const dash  = ((score / 100) * circ).toFixed(2);
  const color = readinessColor(score);
  const verdicts = ['Za wcześnie', 'Słabe', 'Dobre', 'Gotowe!'];
  const verdict  = verdicts[score >= 75 ? 3 : score >= 50 ? 2 : score >= 25 ? 1 : 0];
  return `
    <div class="rdy-gauge-wrap">
      <svg class="rdy-gauge-svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="rdy-gauge-bg"   cx="50" cy="50" r="${r}"/>
        <circle class="rdy-gauge-fill" cx="50" cy="50" r="${r}"
          stroke="${color}"
          stroke-dasharray="${dash} ${circ.toFixed(2)}"
          transform="rotate(-90 50 50)"/>
      </svg>
      <div class="rdy-gauge-inner">
        <div class="rdy-pct" style="color:${color}">${score}<span class="rdy-pct-unit">%</span></div>
        <div class="rdy-verdict">${verdict}</div>
      </div>
    </div>`;
}

function buildReadinessFactors(factors) {
  return `<div class="rdy-factors">${Object.values(factors).map(f => {
    const color = readinessColor(f.score);
    return `
      <div class="rdy-factor">
        <div class="rdy-factor-row">
          <span class="rdy-factor-icon">${f.icon}</span>
          <span class="rdy-factor-name">${f.label}</span>
          <span class="rdy-factor-weight">${f.weight}%</span>
          <span class="rdy-factor-val" style="color:${color}">${f.score}%</span>
        </div>
        <div class="rdy-bar-bg"><div class="rdy-bar-fill" style="width:${f.score}%;background:${color}"></div></div>
      </div>`;
  }).join('')}</div>`;
}

function weatherCodeToEmoji(code) {
  if (code === 0)  return '☀️';
  if (code === 1)  return '🌤️';
  if (code === 2)  return '⛅';
  if (code === 3)  return '☁️';
  if (code <= 48)  return '🌫️';
  if (code <= 55)  return '🌦️';
  if (code <= 57)  return '🌨️';
  if (code <= 65)  return '🌧️';
  if (code <= 77)  return '🌨️';
  if (code <= 82)  return '🌦️';
  if (code <= 86)  return '🌨️';
  return '⛈️';
}

function buildForecastWidget(weather) {
  const days  = weather.daily;
  const times = (days.time                || []).slice(-3);
  const maxT  = (days.temperature_2m_max  || []).slice(-3);
  const minT  = (days.temperature_2m_min  || []).slice(-3);
  const codes = (days.weather_code        || []).slice(-3);
  if (!times.length) return '';

  const DAY_LABELS = ['Nd','Pon','Wt','Śr','Czw','Pt','Sob'];
  const cols = times.map((dateStr, i) => {
    const label = DAY_LABELS[new Date(dateStr + 'T12:00:00').getDay()];
    const emoji = weatherCodeToEmoji(codes[i] ?? 0);
    return `
      <div class="fcast-day">
        <div class="fcast-label">${label}</div>
        <div class="fcast-icon">${emoji}</div>
        <div class="fcast-temps">
          <span class="fcast-max">${Math.round(maxT[i] ?? 0)}°</span>
          <span class="fcast-min">${Math.round(minT[i] ?? 0)}°</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="fcast-wrap">
      <div class="fcast-header">Prognoza 3 dni</div>
      <div class="fcast-strip">${cols}</div>
    </div>`;
}

async function renderReadiness(container, s, overrideCoords = null) {
  const coords = overrideCoords || getBestCoords(s);

  if (!coords) {
    container.innerHTML = `
      <div class="rdy-no-coords">
        <div class="rdy-no-coords-msg">Brak lokalizacji — dodaj pinezkę na mapie lub użyj GPS.</div>
        <button class="rdy-geo-btn" id="rdy-geo-btn">📍 Użyj mojej lokalizacji</button>
      </div>`;
    document.getElementById('rdy-geo-btn')?.addEventListener('click', () => {
      container.innerHTML = '<div class="rdy-loading"><div class="rdy-spin"></div> Pobieranie pozycji…</div>';
      navigator.geolocation.getCurrentPosition(
        pos => renderReadiness(container, s, { lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'geo' }),
        ()  => { container.innerHTML = '<div class="rdy-error">Nie udało się pobrać lokalizacji GPS.</div>'; },
        { timeout: 8000 }
      );
    });
    return;
  }

  container.innerHTML = '<div class="rdy-loading"><div class="rdy-spin"></div> Pobieranie pogody…</div>';

  try {
    const weather = await fetchWeather(coords.lat, coords.lng);
    const result  = calcReadiness(s, weather);
    const srcLabel = coords.source === 'pin'   ? '📍 Twoja pinezka'
                   : coords.source === 'geo'   ? '📡 GPS'
                   : '🌿 Stanowisko atlasowe';

    container.innerHTML = `
      <div class="rdy-source-row">
        <span class="rdy-source-tag">${srcLabel}</span>
        <span class="rdy-coords">${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E</span>
      </div>
      <div class="rdy-main">
        ${buildReadinessGauge(result.total)}
        ${buildReadinessFactors(result.factors)}
      </div>
      <div class="rdy-meta">
        <span class="rdy-meta-chip">🌡️ ${(+result.current.temp).toFixed(1)}°C</span>
        <span class="rdy-meta-chip">💧 ${result.current.rh}% RH</span>
        <span class="rdy-meta-chip">🌧️ ${result.current.rainSum} mm / 3 dni</span>
        <span class="rdy-meta-chip">📅 ${result.current.daysOk} dni ≥ ${s.min_temp_C}°C</span>
      </div>`;

    const fw = document.getElementById('forecast-widget');
    if (fw) fw.innerHTML = buildForecastWidget(weather);
  } catch (e) {
    container.innerHTML = `<div class="rdy-error">⚠ Błąd pobierania pogody: ${e.message}</div>`;
  }
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

async function openModal(s) {
  const modal   = $('species-modal');
  const content = $('modal-content');
  const color   = CAT_COLOR[s.kategoria] || '#2d6a4f';
  jrnLat = null; jrnLng = null; jrnPhoto = null;

  // Faza 1: natychmiastowy szkielet — modal otwiera się bez czekania na sieć
  const isFavSkeleton = getFavorites().has(String(s.id));
  content.innerHTML = `
    <div class="modal-header" style="background:${color}">
      <button class="modal-close" id="modal-close-btn" aria-label="Zamknij">✕</button>
      <button class="fav-btn fav-btn--modal${isFavSkeleton ? ' fav-btn--active' : ''}" data-id="${s.id}"
              aria-label="${isFavSkeleton ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}"
              title="${isFavSkeleton ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">
        ${isFavSkeleton ? '★' : '☆'}
      </button>
      <div class="modal-name">${s.nazwa_polska}</div>
      <div class="modal-latin">${s.nazwa_lacinska}</div>
    </div>
    <div class="spinner-wrap" style="padding:3rem 1rem"><div class="spinner"></div></div>`;

  modal.style.setProperty('--modal-accent', color);
  if (!modal.open) modal.showModal();

  $('modal-close-btn').addEventListener('click', () => modal.close());
  const onBackdropClick = e => { if (e.target === modal) modal.close(); };
  modal.addEventListener('click', onBackdropClick);
  modal.addEventListener('close', () => {
    modal.removeEventListener('click', onBackdropClick);
    destroyMap();
    stopVoiceRecognition();
  }, { once: true });

  // Faza 2: szczegóły on-demand z pamięci podręcznej lub sieci
  if (!detailsCache[s.id]) {
    try {
      const res = await fetch(`data/details/${s.id}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      detailsCache[s.id] = await res.json();
    } catch (e) {
      // Nowe gatunki (id >= 2000) nie mają plików details/ — używamy obiektu z ATLAS_DATA
      detailsCache[s.id] = s;
    }
  }

  if (!modal.open) return; // modal zamknięty podczas ładowania

  const det = detailsCache[s.id]; // pełne dane gatunku
  const f = v => (v !== undefined && v !== null && v !== '') ? v : '—';
  const isToxic    = det.trujace_surowe || det.kategoria === 'Rośliny TRUJĄCE';
  const isSeason   = NOW >= det.sezon_start && NOW <= det.sezon_koniec;
  const isProtected= det.ochrona && det.ochrona !== 'brak';
  const hasCoords  = Array.isArray(det.koordinaty) && det.koordinaty.length > 0;
  const pinCount   = getPrivatePins(det.id).length;
  const isFav      = getFavorites().has(String(det.id));

  const d = new Date();
  const todayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const speciesEntries = getJournal().filter(e => e.speciesId === det.id);
  const totalG = speciesEntries.reduce((sum, e) => sum + (e.ilosc_g || 0), 0);
  const speciesSummary = speciesEntries.length > 0
    ? `<div class="journal-species-summary">Zebrano łącznie: <strong>${totalG} g</strong> (${speciesEntries.length} ${speciesEntries.length === 1 ? 'wpis' : speciesEntries.length < 5 ? 'wpisy' : 'wpisów'})</div>`
    : '';

  // Faza 3: pełny render — wymienia szkielet pełną treścią
  content.innerHTML = `
    <div class="modal-header" style="background:${color}">
      <button class="modal-close" id="modal-close-btn" aria-label="Zamknij">✕</button>
      <button class="fav-btn fav-btn--modal${isFav ? ' fav-btn--active' : ''}" data-id="${det.id}"
              aria-label="${isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}"
              title="${isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}">
        ${isFav ? '★' : '☆'}
      </button>
      <div class="modal-name">${det.nazwa_polska}</div>
      <div class="modal-latin">${det.nazwa_lacinska}</div>
      <div class="modal-flags">
        ${isSeason    ? '<span class="flag flag-season">W sezonie ✓</span>' : ''}
        ${isToxic     ? '<span class="flag flag-toxic">⚠ Trujące</span>'   : ''}
        ${isProtected ? '<span class="flag flag-protected">🔵 Chroniona</span>' : ''}
        ${(hasCoords || pinCount > 0) ? `<span class="flag flag-map">🗺 Mapa</span>` : ''}
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-sec-title">Sezon zbioru</div>
      <div class="modal-season-track">${buildSeasonBar(det.sezon_start, det.sezon_koniec)}</div>
      <div class="modal-month-labels">${MONTH_ABBR.map(m=>`<span>${m}</span>`).join('')}</div>
      <dl class="detail-grid">
        <dt>Szczyt</dt><dd>${f(det.szczyt_zbioru)}</dd>
        <dt>Min. temp.</dt><dd>${det.min_temp_C != null ? `${det.min_temp_C}°C przez min. ${det.dni_min_temp} dni` : '—'}</dd>
        <dt>Wilgotność</dt><dd>${f(det.wilgotnosc)}</dd>
      </dl>
    </div>

    <div class="modal-section modal-readiness-section">
      <div class="modal-sec-title">Współczynnik Gotowości <span class="rdy-beta">BETA</span></div>
      <div id="readiness-widget"></div>
      <div id="forecast-widget"></div>
    </div>

    <div class="modal-section">
      <div class="modal-sec-title">Kulinaria</div>
      <dl class="detail-grid">
        <dt>Zbierasz</dt><dd>${f(det.jadalne_czesci)}</dd>
        <dt>Zastosowanie</dt><dd>${f(det.zastosowanie_kulinarne)}</dd>
        <dt>Przepis / tip</dt><dd>${f(det.przepis_sugestia)}</dd>
      </dl>
    </div>

    <div class="modal-section">
      <div class="modal-sec-title">Lecznicze</div>
      <dl class="detail-grid">
        <dt>Działanie</dt><dd>${f(det.zastosowanie_lecznicze)}</dd>
      </dl>
    </div>

    <div class="modal-section">
      <div class="modal-sec-title">Lokalizacja</div>
      <dl class="detail-grid">
        <dt>Ogólnie</dt><dd>${f(det.wystepowanie_ogolne)}</dd>
        <dt>Regiony PL</dt><dd>${f(det.regiony_polski)}</dd>
        <dt>Sugestie</dt><dd>${f(det.sugestie_lokalizacji)}</dd>
      </dl>
    </div>

    <div class="modal-section modal-map-section">
      <div class="modal-sec-title">Mapa stanowisk</div>
      <div id="species-map"></div>
      <div id="map-click-hint" class="map-hint">Kliknij mapę, aby dodać tajne miejsce zbioru</div>
      ${hasCoords ? `<div class="map-legend">
        <span class="legend-item"><span>🌿</span> Znane stanowisko</span>
        <span class="legend-item"><span>📍</span> Moje miejsce (prywatne)</span>
      </div>` : `<div class="map-legend">
        <span class="legend-item"><span>📍</span> Moje miejsce (prywatne)</span>
      </div>`}
    </div>

    <div class="modal-section">
      <div class="modal-sec-title">Bezpieczeństwo i zbiór</div>
      <dl class="detail-grid">
        <dt>Trudność</dt><dd>${f(det.trudnosc_zbioru)}</dd>
        ${isProtected ? `<dt>Ochrona</dt><dd>${det.ochrona}</dd>` : ''}
      </dl>
      ${det.ostrzezenie && det.ostrzezenie !== 'Brak'
        ? `<div class="warn-block">⚠ ${det.ostrzezenie}</div>` : ''}
    </div>

    <div class="modal-section">
      <div class="modal-sec-title">Ciekawostka</div>
      <div class="curious-block">${f(det.ciekawostka)}</div>
    </div>

    <div class="modal-section modal-journal-section">
      <div class="modal-sec-title">Zanotuj zbiór</div>
      ${speciesSummary}
      <div class="journal-form">
        <div class="journal-form-fields">
          <div class="journal-form-row">
            <label class="journal-label" for="jrn-date">Data</label>
            <input type="date" id="jrn-date" class="journal-input" value="${todayStr}">
          </div>
          <div class="journal-form-row">
            <label class="journal-label" for="jrn-qty">Ilość (g)</label>
            <input type="number" id="jrn-qty" class="journal-input" min="1" max="99999" placeholder="np. 500">
          </div>
        </div>
        <div class="journal-form-row">
          <label class="journal-label" for="jrn-notes">Notatki</label>
          <div class="jrn-notes-wrap">
            <textarea id="jrn-notes" class="journal-input journal-textarea" placeholder="Opcjonalnie… lub dyktuj 🎙" rows="2"></textarea>
            <button type="button" class="jrn-mic-btn" id="jrn-mic-btn"
                    aria-label="Dyktowanie głosowe — tryb brudnych rąk"
                    title="Tryb brudnych rąk — dyktuj notatkę głosowo">🎙</button>
          </div>
        </div>
        <div class="journal-form-row">
          <label class="journal-label">Zdjęcie (opcjonalnie)</label>
          <div class="jrn-photo-row">
            <label class="jrn-photo-btn" for="jrnl-photo-input">📷 Zdjęcie / Galeria</label>
            <input type="file" accept="image/*" id="jrnl-photo-input" style="display:none">
            <div id="jrn-photo-preview-wrap" class="jrn-photo-preview-wrap" hidden>
              <img id="jrn-photo-preview" class="jrn-photo-preview" alt="Podgląd zdjęcia">
              <button type="button" class="jrn-photo-clear" id="jrn-photo-clear" aria-label="Usuń zdjęcie">✕</button>
              <button type="button" class="jrn-lens-btn" id="jrn-lens-btn">🔍 Google Lens</button>
            </div>
          </div>
        </div>
        <div class="journal-form-row">
          <label class="journal-label">Lokalizacja (opcjonalnie)</label>
          <div class="jrn-loc-wrap">
            <div id="jrn-loc-info" class="jrn-loc-info">Brak lokalizacji</div>
            <div class="jrn-loc-btns">
              <button type="button" class="jrn-loc-btn" id="jrn-gps-btn">📍 GPS</button>
              <button type="button" class="jrn-loc-btn" id="jrn-map-toggle-btn">🗺 Mapa</button>
            </div>
          </div>
          <div id="jrn-loc-map-wrap" class="jrn-loc-map-wrap" hidden>
            <div id="jrn-loc-map"></div>
            <div class="jrn-loc-map-hint">Kliknij mapę, aby ustawić lokalizację zbioru</div>
          </div>
        </div>
        <button class="journal-save-btn" id="journal-save-btn">📓 Zapisz w dzienniku</button>
        <div id="journal-save-msg" class="journal-save-msg"></div>
      </div>
    </div>`;

  modal.style.setProperty('--modal-accent', color);

  fetchWikiImage(det.nazwa_lacinska, det.nazwa_polska).then(url => {
    if (!url) return;
    const hdr = content.querySelector('.modal-header');
    if (hdr) {
      hdr.style.backgroundImage = `linear-gradient(rgba(0,0,0,.50),rgba(0,0,0,.50)),url(${url})`;
      hdr.style.backgroundSize = 'cover';
      hdr.style.backgroundPosition = 'center top';
    }
  });

  requestAnimationFrame(() => {
    const rw = document.getElementById('readiness-widget');
    if (rw) renderReadiness(rw, det);
  });
  setTimeout(() => initSpeciesMap(det), 300);

  $('modal-close-btn').addEventListener('click', () => modal.close());

  $('journal-save-btn')?.addEventListener('click', () => {
    const date  = $('jrn-date').value;
    const qty   = $('jrn-qty').value;
    const notes = $('jrn-notes').value;
    const msg   = $('journal-save-msg');
    if (!qty || Number(qty) <= 0) {
      msg.textContent = 'Podaj ilość w gramach.';
      msg.className = 'journal-save-msg journal-save-err';
      return;
    }
    saveJournalEntry(det.id, det.nazwa_polska, date, qty, notes, jrnLat, jrnLng, jrnPhoto);
    $('jrn-qty').value   = '';
    $('jrn-notes').value = '';
    const photoInput = $('jrnl-photo-input');
    const photoWrap  = $('jrn-photo-preview-wrap');
    if (photoInput) photoInput.value = '';
    if (photoWrap)  photoWrap.hidden = true;
    jrnPhoto = null;
    msg.textContent = '✓ Zapisano w dzienniku!';
    msg.className = 'journal-save-msg journal-save-ok';
    setTimeout(() => { msg.textContent = ''; msg.className = 'journal-save-msg'; }, 3000);
  });

  $('jrn-gps-btn')?.addEventListener('click', () => {
    const infoEl = $('jrn-loc-info');
    if (infoEl) infoEl.textContent = 'Pobieranie GPS…';
    navigator.geolocation.getCurrentPosition(
      pos => {
        jrnLat = pos.coords.latitude;
        jrnLng = pos.coords.longitude;
        updateJrnLocInfo();
        if (jrnLocMap) setJrnMapMarker(jrnLat, jrnLng);
      },
      () => { const el = $('jrn-loc-info'); if (el) el.textContent = 'Nie udało się pobrać GPS.'; },
      { timeout: 8000 }
    );
  });

  $('jrn-map-toggle-btn')?.addEventListener('click', () => {
    const wrap = $('jrn-loc-map-wrap');
    if (!wrap) return;
    wrap.hidden = !wrap.hidden;
    if (!wrap.hidden) {
      if (!jrnLocMap) {
        requestAnimationFrame(() => {
          initJrnLocMap();
          setTimeout(() => { if (jrnLocMap) jrnLocMap.invalidateSize(); }, 250);
        });
      } else {
        setTimeout(() => { if (jrnLocMap) jrnLocMap.invalidateSize(); }, 50);
      }
    }
  });

  $('jrnl-photo-input')?.addEventListener('change', async ev => {
    const file = ev.target.files[0];
    if (!file) return;
    jrnPhoto = await compressPhoto(file);
    const preview = $('jrn-photo-preview');
    const wrap    = $('jrn-photo-preview-wrap');
    if (preview) preview.src = jrnPhoto;
    if (wrap)    wrap.hidden = false;
  });

  $('jrn-photo-clear')?.addEventListener('click', () => {
    jrnPhoto = null;
    const input = $('jrnl-photo-input');
    const wrap  = $('jrn-photo-preview-wrap');
    if (input) input.value = '';
    if (wrap)  wrap.hidden = true;
  });

  $('jrn-lens-btn')?.addEventListener('click', async () => {
    if (!jrnPhoto) return;
    try {
      await openVisualSearch(jrnPhoto);
    } catch (err) {
      if (err.name === 'AbortError') return;
      showShareFallbackToast();
    }
  });

  initVoiceNote();
}

// ── GOOGLE LENS / SKANER SYSTEMOWY — natywne Web Share API ──────────────────

function base64ToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const raw  = atob(data);
  const arr  = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function openVisualSearch(photo) {
  const img = photo ?? jrnPhoto;
  if (!img) return;

  const blob = base64ToBlob(img);
  const file = new File([blob], 'znalezisko.jpg', { type: 'image/jpeg' });

  if (navigator.canShare?.({ files: [file] })) {
    // Natywny system share — użytkownik wybiera Google Lens lub inną aplikację
    await navigator.share({
      files: [file],
      title: 'Zidentyfikuj gatunek',
      text: 'Sprawdź co to za roślina lub grzyb',
    });
    return;
  }

  // Fallback — przeglądarka / system nie obsługuje share z plikami
  const e = new Error('Web Share API niedostępne');
  e.code = 'NO_SHARE';
  throw e;
}

function showShareFallbackToast() {
  document.getElementById('share-fallback-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'share-fallback-toast';
  toast.className = 'sft-wrap';
  toast.innerHTML = `
    <span class="sft-icon" aria-hidden="true">📸</span>
    <div class="sft-body">
      <div class="sft-title">Udostępnianie niedostępne</div>
      <div class="sft-msg">Zapisz zdjęcie przytrzymując je, a następnie otwórz Google Lens na swoim telefonie, by zidentyfikować gatunek.</div>
    </div>
    <button class="sft-close" aria-label="Zamknij">✕</button>`;
  document.body.appendChild(toast);
  toast.querySelector('.sft-close').addEventListener('click', () => toast.remove());
  requestAnimationFrame(() => toast.classList.add('sft-visible'));
  setTimeout(() => { toast.classList.remove('sft-visible'); setTimeout(() => toast.remove(), 400); }, 8000);
}

// ── KOPIA ZAPASOWA ────────────────────────────────────────────────────────────

function exportBackup() {
  const data = {
    version:    1,
    exportedAt: new Date().toISOString(),
    journal:    JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]'),
    pins:       JSON.parse(localStorage.getItem(PINS_KEY)    || '[]'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `forest_assistant_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importBackup() {
  const input  = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const showMsg = (text, cls) => {
        const el = $('jrnl-backup-msg');
        if (el) { el.textContent = text; el.className = `jrnl-backup-msg ${cls}`; }
      };
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.journal)) throw new Error('brak tablicy wpisów w pliku');
        localStorage.setItem(JOURNAL_KEY, JSON.stringify(data.journal));
        if (Array.isArray(data.pins)) localStorage.setItem(PINS_KEY, JSON.stringify(data.pins));
        renderJournalModal();                          // przebuduj modal ze świeżymi danymi
        if (treasureMap) renderTreasureMarkers();      // odśwież mapę skarbów
        showMsg(`✓ Zaimportowano ${data.journal.length} wpisów`, 'jrnl-backup-ok');
      } catch (err) {
        showMsg(`✗ Błąd importu — ${err.message}`, 'jrnl-backup-err');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── MAPA SKARBÓW (V10) ────────────────────────────────────────────────────────

const MV_FILTER_FN = {
  all:     () => true,
  warzywa: s => ['Owoce dzikie','Kwiaty jadalne','Drzewa jadalne','Rośliny wodne','Porosty'].includes(s.kategoria) ||
                (s.kategoria === 'Rośliny zielne' && s.podkategoria === 'Dzikie warzywa'),
  ziola:   s => s.podkategoria === 'Dzikie przyprawy',
  kwiaty:  s => s.kategoria === 'Kwiaty jadalne',
  grzyby:  s => s.kategoria === 'Grzyby' || s.kategoria === 'Rośliny TRUJĄCE',
};

function makePinIcon(color, delay = 0) {
  return L.divIcon({
    html: `<div class="mv-pin" style="background:${color};animation-delay:${delay}ms"></div>`,
    className: '',
    iconSize:    [20, 20],
    iconAnchor:  [10, 10],
    popupAnchor: [0, -13],
  });
}

function buildTreasurePopup(entry, species) {
  const dateStr  = entry.data || new Date(entry.savedAt).toLocaleDateString('pl-PL');
  const color    = species ? (CAT_COLOR[species.kategoria] || '#276049') : '#276049';
  const photoHtml = entry.photo
    ? `<img class="tv-popup-photo" src="${entry.photo}" alt="Zdjęcie">` : '';
  const qtyHtml  = entry.ilosc_g
    ? `<span class="tv-popup-chip">⚖ ${entry.ilosc_g} g</span>` : '';
  const noteHtml = entry.notatki
    ? `<div class="tv-popup-note">${entry.notatki}</div>` : '';
  return `<div class="tv-popup">
    ${photoHtml}
    <div class="tv-popup-name" style="border-left-color:${color}">${entry.nazwaPolska}</div>
    <div class="tv-popup-meta">
      <span class="tv-popup-chip">📅 ${dateStr}</span>${qtyHtml}
    </div>${noteHtml}
  </div>`;
}

function renderTreasureMarkers() {
  if (!treasureMap) return;

  mvMarkers.forEach(m => m.remove());
  mvMarkers = [];

  // parseFloat + isNaN — akceptuje Number i String, odrzuca brakujące dane
  const allEntries = getJournal().filter(e => {
    const lat = parseFloat(e.lat);
    const lng = parseFloat(e.lng);
    return !isNaN(lat) && !isNaN(lng);
  });

  console.log('Znalazłem wpisów z GPS:', allEntries.length);

  const filterFn = MV_FILTER_FN[mvFilter] || MV_FILTER_FN.all;
  // featureGroup pozwala użyć getBounds() zamiast ręcznego zbierania współrzędnych
  const group = L.featureGroup();

  let pinIdx = 0;
  allEntries.forEach(entry => {
    const lat = parseFloat(entry.lat);
    const lng = parseFloat(entry.lng);
    // String() po obu stronach — odporna na niezgodność Number vs String w id
    const species = allSpecies.find(s => String(s.id) === String(entry.speciesId));
    if (species && !filterFn(species)) return;
    const color = species ? (CAT_COLOR[species.kategoria] || '#276049') : '#276049';
    const delay = Math.min(pinIdx * 55, 550); // stagger 55ms, max 550ms
    const marker = L.marker([lat, lng], { icon: makePinIcon(color, delay) })
      .bindPopup(buildTreasurePopup(entry, species), { maxWidth: 240 });
    marker.addTo(treasureMap);
    group.addLayer(marker);
    mvMarkers.push(marker);
    pinIdx++;
  });

  // Pusty ekran tylko gdy brak jakichkolwiek wpisów z GPS
  const emptyEl = $('mv-empty');
  if (emptyEl) emptyEl.hidden = allEntries.length > 0;

  // Auto-fit: wycentruj na widocznych pinezkach
  if (group.getLayers().length > 0) {
    try {
      treasureMap.fitBounds(group.getBounds(), { padding: [52, 52], maxZoom: 14 });
    } catch {
      // fallback: wycentruj na ostatniej pince
      const last = group.getLayers().at(-1);
      if (last) treasureMap.setView(last.getLatLng(), 13);
    }
  }
}

function showMapLoader() {
  const el = $('mv-loader');
  if (el) { el.hidden = false; el.classList.remove('fading'); }
}

function hideMapLoader() {
  const el = $('mv-loader');
  if (!el || el.hidden) return;
  el.classList.add('fading');
  setTimeout(() => { el.hidden = true; el.classList.remove('fading'); }, 380);
}

function openMapView() {
  $('map-view').hidden = false;
  document.body.style.overflow = 'hidden';
  showMapLoader();

  if (!treasureMap) {
    // Double-rAF: dwa cykle renderowania, żeby browser policzył rozmiar
    // #treasure-map zanim Leaflet go zmierzy — bez tego mapa startuje 0×0
    requestAnimationFrame(() => requestAnimationFrame(() => {
      treasureMap = L.map('treasure-map', { zoomControl: true }).setView([52.05, 19.5], 6);
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(treasureMap);
      tiles.once('load', hideMapLoader);
      setTimeout(hideMapLoader, 4000); // fallback gdy kafelki nie odpalą eventu
      renderTreasureMarkers();
      initTreasureMapGps();
    }));
  } else {
    // Mapa już istnieje — tylko odśwież rozmiar i naniesienia
    requestAnimationFrame(() => {
      treasureMap.invalidateSize();
      renderTreasureMarkers();
      hideMapLoader();
    });
  }
}

function closeMapView() {
  $('map-view').hidden = true;
  document.body.style.overflow = '';
}

function bindMapView() {
  $('map-view-btn')?.addEventListener('click', openMapView);
  $('mv-close-btn')?.addEventListener('click', closeMapView);
  $('mv-refresh-btn')?.addEventListener('click', () => {
    if (treasureMap) { treasureMap.invalidateSize(); renderTreasureMarkers(); }
  });
  $('mv-offline-btn')?.addEventListener('click', handleOfflineDownload);
  document.querySelectorAll('.mv-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mv-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mvFilter = btn.dataset.filter;
      renderTreasureMarkers();
    });
  });
}

// ── POBIERANIE KAFELKÓW OFFLINE ───────────────────────────────────────────────

function calcTileUrls(map, maxExtra = 2) {
  const bounds = map.getBounds();
  const zoom   = Math.floor(map.getZoom());
  const urls   = [];

  for (let dz = 0; dz <= maxExtra; dz++) {
    const z = Math.min(zoom + dz, 17);
    const n = Math.pow(2, z);

    const lngToX = lng => Math.floor((lng + 180) / 360 * n);
    const latToY = lat => {
      const r = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    };

    const x0 = lngToX(bounds.getWest()),  x1 = lngToX(bounds.getEast());
    const y0 = latToY(bounds.getNorth()), y1 = latToY(bounds.getSouth());

    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(`https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`);
  }

  return urls;
}

async function handleOfflineDownload() {
  if (!treasureMap) return;
  const btn = $('mv-offline-btn');
  if (!btn || btn.disabled) return;

  const urls = calcTileUrls(treasureMap);
  if (!urls.length) { showMvToast('Brak kafelków w tym obszarze'); return; }
  if (urls.length > 400) {
    showMvToast('Obszar zbyt duży — przybliż mapę i spróbuj ponownie');
    return;
  }

  btn.disabled = true;
  btn.classList.add('mv-offline-btn--loading');
  btn.textContent = `⏳ 0/${urls.length} kafelków…`;

  try {
    const cache = await caches.open('forest-map-tiles-v1');
    const BATCH = 8;
    let done = 0;

    for (let i = 0; i < urls.length; i += BATCH) {
      const batch = urls.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(async url => {
        if (await cache.match(url)) { done++; return; }
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) await cache.put(url, res);
        done++;
      }));
      btn.textContent = `⏳ ${done}/${urls.length} kafelków…`;
      if (i + BATCH < urls.length) await new Promise(r => setTimeout(r, 40));
    }

    btn.classList.remove('mv-offline-btn--loading');
    btn.classList.add('mv-offline-btn--done');
    btn.textContent = 'Obszar zapisany ✔';
    showMvToast(`Mapa offline: ${done} kafelków zapisanych`);

    setTimeout(() => {
      btn.textContent = '⬇ Pobierz obszar offline';
      btn.classList.remove('mv-offline-btn--done');
      btn.disabled = false;
    }, 4500);
  } catch {
    btn.textContent = '⬇ Pobierz obszar offline';
    btn.classList.remove('mv-offline-btn--loading');
    btn.disabled = false;
    showMvToast('Błąd pobierania — sprawdź połączenie');
  }
}

// ── SZYBKI SKAN (STRONA GŁÓWNA) ──────────────────────────────────────────────

function bindMainLens() {
  $('main-lens-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const banner  = document.querySelector('.qs-banner');
    banner?.classList.add('qs-banner--loading');

    try {
      const compressed = await compressPhoto(file);
      await openVisualSearch(compressed);
    } catch (err) {
      if (err.name === 'AbortError') return; // użytkownik anulował share — OK
      showShareFallbackToast();
    } finally {
      banner?.classList.remove('qs-banner--loading');
    }
  });
}

// ── TRYB WYSOKIEGO KONTRASTU ──────────────────────────────────────────────────

function initHighContrast() {
  if (localStorage.getItem('fa_high_contrast') === '1') {
    document.body.classList.add('high-contrast');
  }
  $('contrast-toggle-btn')?.addEventListener('click', () => {
    const on = document.body.classList.toggle('high-contrast');
    localStorage.setItem('fa_high_contrast', on ? '1' : '0');
  });
}

// ── GPS NA ŻYWO (MAPA SKARBÓW) ────────────────────────────────────────────────

function showMvToast(text) {
  const wrap = $('map-view');
  if (!wrap) return;
  let toast = wrap.querySelector('.mv-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'mv-toast';
    wrap.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('mv-toast--visible');
  setTimeout(() => toast.classList.remove('mv-toast--visible'), 3000);
}

function initTreasureMapGps() {
  const GpsControl = L.Control.extend({
    onAdd() {
      const btn = L.DomUtil.create('button', 'mv-gps-btn');
      btn.title = 'Moja lokalizacja GPS';
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="22"/><line x1="2" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="22" y2="12"/></svg>`;
      L.DomEvent.on(btn, 'click', L.DomEvent.stop);
      L.DomEvent.on(btn, 'click', () => {
        btn.classList.add('mv-gps-btn--locating');
        treasureMap.locate({ setView: true, maxZoom: 16 });
      });
      return btn;
    },
    onRemove() {},
  });
  new GpsControl({ position: 'bottomright' }).addTo(treasureMap);

  treasureMap.on('locationfound', e => {
    document.querySelector('.mv-gps-btn')?.classList.remove('mv-gps-btn--locating');
    if (gpsMarker) { gpsMarker.remove(); gpsMarker = null; }
    gpsMarker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: '',
        html: '<div class="mv-gps-dot"><div class="mv-gps-dot-ring"></div></div>',
        iconSize:   [20, 20],
        iconAnchor: [10, 10],
      }),
      zIndexOffset: 1000,
    }).addTo(treasureMap);
  });

  treasureMap.on('locationerror', () => {
    document.querySelector('.mv-gps-btn')?.classList.remove('mv-gps-btn--locating');
    showMvToast('GPS niedostępny — sprawdź uprawnienia urządzenia');
  });
}

// ── TRYB OFFLINE ──────────────────────────────────────────────────────────────

function initOfflineDetection() {
  const render = () => {
    const existing = document.getElementById('offline-bar');
    if (!navigator.onLine) {
      if (existing) return;
      const bar = document.createElement('div');
      bar.id        = 'offline-bar';
      bar.className = 'offline-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      bar.innerHTML = '<span aria-hidden="true">📵</span> Tryb offline — przeglądasz zapisane dane';
      document.getElementById('app-header')?.insertAdjacentElement('afterend', bar);
    } else {
      existing?.remove();
    }
  };
  window.addEventListener('online',  render);
  window.addEventListener('offline', render);
  render();
}

// ── Parking Radar ─────────────────────────────────────────────────────────────

const PARKING_KEY = 'fa_parking_v1';

let radarWatchId     = null;
let radarHeading     = null;
let radarCurrentLat  = null;
let radarCurrentLng  = null;
let radarOpen        = false;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcBearing(lat1, lng1, lat2, lng2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function loadParking() {
  try { return JSON.parse(localStorage.getItem(PARKING_KEY)); } catch { return null; }
}

function updateParkingBtn() {
  const saved = loadParking();
  const saveBtn  = $('parking-save-btn');
  const resetBtn = $('parking-reset-btn');
  if (!saveBtn) return;
  if (saved) {
    saveBtn.querySelector('.parking-btn-icon').textContent = '🧭';
    saveBtn.querySelector('.parking-btn-label').textContent = 'Prowadź do auta';
    saveBtn.classList.add('parking-btn--active');
    resetBtn?.removeAttribute('hidden');
  } else {
    saveBtn.querySelector('.parking-btn-icon').textContent = '📍';
    saveBtn.querySelector('.parking-btn-label').textContent = 'Zapisz punkt startu';
    saveBtn.classList.remove('parking-btn--active');
    resetBtn?.setAttribute('hidden', '');
  }
}

function saveParkingLocation() {
  if (!navigator.geolocation) {
    showParkingToast('GPS niedostępny na tym urządzeniu.');
    return;
  }
  const saveBtn = $('parking-save-btn');
  saveBtn?.classList.add('parking-btn--saving');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const data = { lat: pos.coords.latitude, lng: pos.coords.longitude, savedAt: Date.now() };
      try { localStorage.setItem(PARKING_KEY, JSON.stringify(data)); } catch {}
      saveBtn?.classList.remove('parking-btn--saving');
      updateParkingBtn();
      showParkingToast('Punkt startu zapisany!');
    },
    () => {
      saveBtn?.classList.remove('parking-btn--saving');
      showParkingToast('Nie udało się pobrać lokalizacji. Sprawdź uprawnienia GPS.');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function showParkingToast(msg) {
  const existing = document.getElementById('parking-toast');
  existing?.remove();
  const t = document.createElement('div');
  t.id = 'parking-toast';
  t.className = 'parking-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('parking-toast--visible'));
  setTimeout(() => { t.classList.remove('parking-toast--visible'); setTimeout(() => t.remove(), 400); }, 3000);
}

function openRadarModal() {
  const saved = loadParking();
  if (!saved) return;
  const modal = $('radar-modal');
  if (!modal) return;
  radarOpen = true;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';

  const when = new Date(saved.savedAt);
  const pad = n => String(n).padStart(2, '0');
  $('radar-saved-at').textContent = `Zapisano: ${pad(when.getDate())}.${pad(when.getMonth()+1)} ${pad(when.getHours())}:${pad(when.getMinutes())}`;

  radarCurrentLat = null;
  radarCurrentLng = null;
  $('radar-distance').textContent = '— m';
  $('radar-hint').textContent = 'Szukam Twojej pozycji…';

  radarWatchId = navigator.geolocation.watchPosition(
    pos => {
      radarCurrentLat = pos.coords.latitude;
      radarCurrentLng = pos.coords.longitude;
      updateRadarDisplay();
    },
    () => { $('radar-hint').textContent = 'Błąd GPS — sprawdź uprawnienia.'; },
    { enableHighAccuracy: true, maximumAge: 2000 }
  );

  const evtName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(evtName, onDeviceOrientation, true);
}

function closeRadarModal() {
  radarOpen = false;
  const modal = $('radar-modal');
  if (modal) modal.hidden = true;
  document.body.style.overflow = '';
  if (radarWatchId !== null) { navigator.geolocation.clearWatch(radarWatchId); radarWatchId = null; }
  const evtName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.removeEventListener(evtName, onDeviceOrientation, true);
  radarHeading = null;
}

function onDeviceOrientation(e) {
  if (!radarOpen) return;
  let heading = null;
  if (e.webkitCompassHeading != null) {
    heading = e.webkitCompassHeading;
  } else if (e.absolute && e.alpha != null) {
    heading = (360 - e.alpha) % 360;
  } else if (e.alpha != null) {
    heading = (360 - e.alpha) % 360;
  }
  if (heading === null) return;
  radarHeading = heading;
  updateRadarDisplay();
}

function updateRadarDisplay() {
  const saved = loadParking();
  if (!saved || radarCurrentLat === null) return;

  const dist = haversine(radarCurrentLat, radarCurrentLng, saved.lat, saved.lng);
  const distText = dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(2)} km`;
  $('radar-distance').textContent = distText;

  const bearing = calcBearing(radarCurrentLat, radarCurrentLng, saved.lat, saved.lng);

  if (radarHeading !== null) {
    const arrowAngle = (bearing - radarHeading + 360) % 360;
    const svg = $('radar-arrow-svg');
    if (svg) svg.style.transform = `rotate(${arrowAngle}deg)`;
    $('radar-hint').textContent = dist < 10 ? 'Jesteś na miejscu!' : getDirectionHint(arrowAngle);
  } else {
    $('radar-hint').textContent = 'Obróć telefon, aby skalibrować kompas.';
  }
}

function getDirectionHint(angle) {
  const dirs = ['Prosto','Lekko w prawo','W prawo','Ostro w prawo','Za tobą','Ostro w lewo','W lewo','Lekko w lewo'];
  return dirs[Math.round(angle / 45) % 8];
}

function initParkingRadar() {
  updateParkingBtn();

  $('parking-save-btn')?.addEventListener('click', () => {
    const saved = loadParking();
    if (saved) {
      openRadarModal();
    } else {
      saveParkingLocation();
    }
  });

  $('parking-reset-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    localStorage.removeItem(PARKING_KEY);
    updateParkingBtn();
    showParkingToast('Punkt startu usunięty.');
  });

  $('radar-close-btn')?.addEventListener('click', closeRadarModal);

  $('radar-modal')?.addEventListener('click', e => {
    if (e.target === $('radar-modal')) closeRadarModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && radarOpen) closeRadarModal();
  });
}

// ── Image cache warm-up ────────────────────────────────────────────────────────

const CACHE_WARM_KEY = 'fa_img_cache_warm_v1';

async function warmImageCache() {
  if (!navigator.onLine)           return;
  if (!allSpecies.length)          return;
  if (!('serviceWorker' in navigator)) return;
  if (localStorage.getItem(CACHE_WARM_KEY)) return;

  const BATCH = 4;
  const DELAY = 350;

  for (let i = 0; i < allSpecies.length; i += BATCH) {
    if (!navigator.onLine) break;
    await Promise.allSettled(
      allSpecies.slice(i, i + BATCH).map(async s => {
        try {
          const url = await fetchWikiImage(s.nazwa_lacinska, s.nazwa_polska);
          if (url) await fetch(url); // SW przechwyci i zapisze w cache
        } catch {}
      })
    );
    if (i + BATCH < allSpecies.length) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }

  try { localStorage.setItem(CACHE_WARM_KEY, '1'); } catch {}
}

// ── NOTATKI GŁOSOWE (VOICE NOTES) ────────────────────────────────────────────

function stopVoiceRecognition() {
  if (!activeRecognition) return;
  try { activeRecognition.abort(); } catch {}
  activeRecognition = null;
}

function showVoiceToast(msg) {
  document.getElementById('voice-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'voice-toast';
  toast.className = 'voice-toast';
  toast.setAttribute('role', 'alert');
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('voice-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('voice-toast--visible');
    setTimeout(() => toast.remove(), 380);
  }, 4500);
}

function initVoiceNote() {
  const btn = $('jrn-mic-btn');
  if (!btn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    btn.disabled = true;
    btn.title = 'Twoja przeglądarka nie wspiera rozpoznawania mowy';
    btn.classList.add('jrn-mic-btn--unsupported');
    return;
  }

  btn.addEventListener('click', () => {
    if (activeRecognition) {
      stopVoiceRecognition();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    activeRecognition = recognition;

    recognition.onstart = () => {
      btn.classList.add('jrn-mic-btn--active');
      btn.setAttribute('aria-label', 'Zatrzymaj dyktowanie');
    };

    recognition.onresult = e => {
      const transcript = e.results[0][0].transcript;
      const ta = $('jrn-notes');
      if (ta) ta.value = ta.value ? ta.value + ' ' + transcript : transcript;
    };

    recognition.onerror = e => {
      if (e.error === 'not-allowed') {
        showVoiceToast('🎙 Brak dostępu do mikrofonu. Sprawdź uprawnienia w ustawieniach przeglądarki.');
      } else if (e.error === 'no-speech') {
        showVoiceToast('Nie wykryto mowy. Spróbuj ponownie.');
      } else if (e.error === 'network') {
        showVoiceToast('Brak połączenia — rozpoznawanie mowy wymaga internetu.');
      } else {
        showVoiceToast('Błąd mikrofonu. Spróbuj ponownie.');
      }
    };

    recognition.onend = () => {
      activeRecognition = null;
      btn.classList.remove('jrn-mic-btn--active');
      btn.setAttribute('aria-label', 'Dyktowanie głosowe — tryb brudnych rąk');
    };

    try {
      recognition.start();
    } catch {
      activeRecognition = null;
      showVoiceToast('Nie udało się uruchomić mikrofonu.');
    }
  });
}

// ── ULUBIONE (FAVORITES) ──────────────────────────────────────────────────────

function getFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem('favoriteSpecies') || '[]')); }
  catch { return new Set(); }
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const sid = String(id);
  if (favs.has(sid)) favs.delete(sid);
  else favs.add(sid);
  localStorage.setItem('favoriteSpecies', JSON.stringify([...favs]));
  const isFav = favs.has(sid);
  document.querySelectorAll(`.fav-btn[data-id="${id}"]`).forEach(btn => {
    btn.classList.toggle('fav-btn--active', isFav);
    btn.setAttribute('aria-label', isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych');
    btn.title = isFav ? 'Usuń z ulubionych' : 'Dodaj do ulubionych';
    btn.textContent = isFav ? '★' : '☆';
  });
  renderFavorites();
}

function renderFavorites() {
  const section = $('favorites-section');
  const countEl = $('fav-count');
  if (!section) return;
  const favs = getFavorites();
  if (countEl) countEl.textContent = favs.size > 0 ? String(favs.size) : '';
  if (!favs.size) {
    section.innerHTML = `<p class="fav-empty">Twoja leśna lista jest pusta. Oznacz gwiazdką ulubione gatunki w atlasie.</p>`;
    return;
  }
  const favSpecies = allSpecies.filter(s => favs.has(String(s.id)));
  section.innerHTML = `<div class="fav-grid">${favSpecies.map(buildCard).join('')}</div>`;
  observeCardImages();
}

function bindFavorites() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.fav-btn');
    if (!btn) return;
    e.stopPropagation();
    toggleFavorite(Number(btn.dataset.id));
  });

  $('favorites-wrap')?.addEventListener('click', e => {
    if (e.target.closest('.fav-btn')) return;
    const card = e.target.closest('.species-card');
    if (!card) return;
    const sp = allSpecies.find(s => s.id === Number(card.dataset.id));
    if (sp) openModal(sp);
  });
}

// ── POWIADOMIENIA SEZONOWE ────────────────────────────────────────────────────

function showFavNotifMsg(text, duration = 5000) {
  const el = $('fav-notif-msg');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.hidden = true; }, duration);
}

function checkActiveSeasonNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem('notificationsEnabled') !== 'true') return;

  const favs = getFavorites();
  if (!favs.size) return;

  const year     = new Date().getFullYear();
  const monthStr = String(NOW).padStart(2, '0');

  const inSeason = allSpecies.filter(s =>
    favs.has(String(s.id)) &&
    NOW >= s.sezon_start && NOW <= s.sezon_koniec
  );

  const unsent = inSeason.filter(s =>
    !localStorage.getItem(`notified_${year}_${monthStr}_${s.id}`)
  );

  if (!unsent.length) return;

  try {
    if (unsent.length === 1) {
      new Notification('Leśny Asystent 🌱', {
        body: `Właśnie trwa szczyt sezonu na Twój ulubiony gatunek: ${unsent[0].nazwa_polska}!`,
        icon: './icons/icon-192.svg',
        tag: `season-${year}-${monthStr}`,
      });
    } else {
      const preview = unsent.slice(0, 2).map(s => s.nazwa_polska).join(', ');
      const rest    = unsent.length > 2 ? ` i ${unsent.length - 2} więcej` : '';
      new Notification('Leśny Asystent 🌱', {
        body: `${unsent.length} Twoich ulubionych gatunków jest teraz w sezonie: ${preview}${rest}!`,
        icon: './icons/icon-192.svg',
        tag: `season-${year}-${monthStr}`,
      });
    }
  } catch { /* przeglądarka może blokować mimo granted */ }

  // Zapisz flagę dla każdego gatunku — nie spamujemy w tym miesiącu
  unsent.forEach(s =>
    localStorage.setItem(`notified_${year}_${monthStr}_${s.id}`, '1')
  );
}

function bindNotificationToggle() {
  const checkbox = $('fav-notif-checkbox');
  const label    = document.querySelector('.fav-notif-toggle');
  if (!checkbox) return;

  // Jeśli przeglądarka nie obsługuje Notification API — wyłącz toggle
  if (!('Notification' in window)) {
    if (label) label.classList.add('fav-notif-toggle--disabled');
    checkbox.disabled = true;
    return;
  }

  // Odtwórz zapisany stan
  const isGranted = Notification.permission === 'granted';
  const isEnabled = localStorage.getItem('notificationsEnabled') === 'true';
  checkbox.checked = isGranted && isEnabled;

  checkbox.addEventListener('change', async () => {
    if (checkbox.checked) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        localStorage.setItem('notificationsEnabled', 'true');
        showFavNotifMsg('Powiadomienia włączone — dostaniesz znać, gdy Twoje ulubione będą w sezonie 🌿');
        checkActiveSeasonNotifications();
      } else {
        // Cofnij toggle i poinformuj użytkownika
        checkbox.checked = false;
        localStorage.setItem('notificationsEnabled', 'false');
        showFavNotifMsg('Brak zgody — zmień ustawienia przeglądarki, aby włączyć powiadomienia.');
      }
    } else {
      localStorage.setItem('notificationsEnabled', 'false');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
