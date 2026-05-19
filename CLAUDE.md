# Forest Assistant — CLAUDE.md

## Status projektu
**Etap V2 w trakcie wdrażania (Mapy Leaflet + PWA)**

## Architektura
- `index.html` — szkielet UI, Leaflet CDN, manifest link, SW registration
- `css/style.css` — wszystkie style (BEM-like, CSS vars)
- `js/app.js` — cała logika (filtrowanie, modal, mapy Leaflet, LocalStorage)
- `data/species.json` — 120 gatunków, 24+ pola na rekord (+ `koordinaty` dla ~18 gatunków)
- `manifest.json` — PWA manifest
- `service-worker.js` — offline cache (cache-first dla app shell, network-first dla kafli OSM)
- `icons/` — SVG ikony PWA

## Zasady kodowania
- Zero monolitów, modularny podział pliku
- Brak logowania, brak backendu — tylko LocalStorage i fetch JSON
- Prywatne pinezki → `fa_private_pins` w LocalStorage (array obiektów `{speciesId, lat, lng, savedAt}`)
- Leaflet mapa inicjalizuje się w `openModal()` z double-rAF by uniknąć 0-size kontenera
- Ikony map: `L.divIcon` z emoji (bez zewnętrznych plików PNG)

## Etapy roadmapy
- **V1** ✅ — atlas 120 gatunków, wyszukiwarka z autouzupełnianiem, 4 kategorie, modal szczegółów
- **V2** 🔄 — Leaflet.js + OpenStreetMap w modalu, zielone pinezki z JSON, prywatne miejscówki (LocalStorage), PWA offline
- **V3** — API Open-Meteo, Współczynnik Gotowości (Wg), alerty push
- **V4** — dziennik zbiorów, test sobowtóra, przelicznik wagowy, AMOLED dark mode

## Dane JSON — pola
`id, nazwa_polska, nazwa_lacinska, kategoria, podkategoria, sezon_start, sezon_koniec, szczyt_zbioru, min_temp_C, dni_min_temp, wilgotnosc, jadalne_czesci, zastosowanie_kulinarne, zastosowanie_lecznicze, przepis_sugestia, wystepowanie_ogolne, regiony_polski, sugestie_lokalizacji, trujace_surowe, ostrzezenie, trudnosc_zbioru, img_search, ciekawostka, ochrona, koordinaty?`

`koordinaty` — opcjonalne, array `{lat, lng, opis}`, obecne u ~18 gatunków.
