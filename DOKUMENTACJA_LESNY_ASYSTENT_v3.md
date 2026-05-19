# 🌿 Leśny Asystent Zbieracza — Dokumentacja Projektu

> **Deweloper i twórca aplikacji: Mateusz P.**
> Wersja dokumentacji: 3.0 | Data: 2025

---

## 1. OPIS PROJEKTU

**Leśny Asystent Zbieracza** to progresywna aplikacja webowa (PWA) działająca jak mobilny przewodnik terenowy po dzikich roślinach, grzybach i owocach. Łączy bazę 120 gatunków z algorytmem predykcji fenologicznej opartym na danych pogodowych w czasie rzeczywistym.

### Dla kogo?
Zbieracze-amatorzy i entuzjaści foraging z całej Polski (głównie region Wielkopolski i okolice do ~300 km), którzy chcą wiedzieć **co, gdzie i kiedy** zbierać w terenie.

### Co wyróżnia aplikację?
- Nie jest to zwykły atlas — **przewiduje aktywne zbiory** na podstawie aktualnej pogody i pory roku
- Lokalizacje opisane dla **całej Polski** z sugestiami regionalnymi (Poznań, Mazury, Bieszczady, Śląsk itd.)
- Ostrzeżenia toksyczne z opisem jak odróżnić od niebezpiecznych sobowtórów
- Działa offline po pierwszym załadowaniu

---

## 2. BAZA DANYCH — STAN AKTUALNY

### ⚠️ WAŻNE dla Claude Code

**Baza danych jest już gotowa.** Nie twórz jej od zera.

Plik źródłowy: `baza_js.json` — **120 gatunków**, wygenerowany ze skryptów Python.

Wczytaj go jako:
```javascript
// W kodzie aplikacji — wbuduj zawartość baza_js.json jako zmienną:
const BAZA = [ ...zawartość tablicy z baza_js.json... ];
```

Lub załaduj zewnętrznie:
```javascript
const res = await fetch('data/species.json');
const { species } = await res.json();
```

### Kategorie w bazie (9 kategorii, 120 gatunków):

| Kategoria | Liczba | Przykłady |
|---|---|---|
| Rośliny zielne | 21 | Pokrzywa, Czosnek niedźwiedzi, Szczaw, Marchew dzika, Kminek |
| Rośliny lecznicze | 38 | Dziurawiec, Rumianek, Melisa, Waleriana, Macierzanka |
| Kwiaty jadalne | 7 | Lipa, Czarny bez (kwiat), Akacja, Fiołek wonny |
| Owoce dzikie | 26 | Dzika róża, Borówka, Malina, Rokitnik, Tarnina |
| Drzewa jadalne | 8 | Brzoza (sok), Dąb (żołędzie), Sosna (pąki), Leszczyna |
| Grzyby | 16 | Borowik, Kurka, Maślak, Rydz, Boczniak, Purchawka |
| Rośliny wodne | 3 | Pałka, Tatarak, Rzeżucha wodna |
| Porosty | 2 | Płucnica islandzka, Mąkla tarniowa |
| Rośliny TRUJĄCE | 6 | Pokrzyk, Konwalia, Szczwół, Barszcz Sosnowskiego (edukacyjnie) |
| **RAZEM** | **120** | |

---

## 3. STRUKTURA REKORDU BAZY DANYCH

### ⚠️ WAŻNE — rzeczywiste nazwy pól

Poniżej dokładna struktura rekordu z `baza_js.json`. **Używaj tych nazw pól** — nie zmieniaj ich.

```json
{
  "id": 18,
  "nazwa_pl": "Czosnek niedźwiedzi",
  "nazwa_lat": "Allium ursinum",
  "kategoria": "Rośliny zielne",
  "podkategoria": "Dzikie przyprawy",
  "sezon_start": 3,
  "sezon_koniec": 5,
  "szczyt": "kwiecień",
  "min_temp": 7,
  "potrzeba_deszcz": false,
  "jadalne": "Liście, kwiaty (cebulki chronione!)",
  "kulinarne": "Pesto, masło czosnkowe, zupy, sałatki, twarożek",
  "lecznicze": "Obniżanie ciśnienia, działanie antybakteryjne, detoks, miażdżyca",
  "przepis": "Pesto: liście + parmezan + orzechy włoskie + oliwa + sól – 5 min roboty",
  "wystepowanie": "Lasy liściaste, wilgotne doliny rzeczne, buczyny",
  "regiony": "Podkarpacie i Bieszczady: masowe stanowiska | Małopolska: Ojców, Gorce | Śląsk: Beskidy",
  "lokalizacje": "Najlepiej: Bieszczady (Wetlina, Cisna) | Blisko Poznania: Las Pniewiański ~100 km | Mazury: nielicznie nad Bugiem",
  "trujace": false,
  "ostrzezenie": "UWAGA: Łatwo pomylić z TRUJĄCĄ konwalią majową! ZAWSZE sprawdź czosnkowy zapach!",
  "trudnosc": "sredni",
  "img_search": "Allium ursinum czosnek niedźwiedzi las biały",
  "ciekawostka": "Niedźwiedzie jedzą go jako pierwszy posiłek po hibernacji. Sezon trwa tylko 3–4 tygodnie!",
  "ochrona": "cebulki chronione – zbieraj tylko liście"
}
```

### Opis kluczowych pól:

| Pole | Typ | Opis |
|---|---|---|
| `sezon_start` / `sezon_koniec` | int 1–12 | Miesiące sezonu zbiorów |
| `szczyt` | string | Tekstowy opis szczytu (np. "kwiecień–maj") |
| `min_temp` | int °C | Minimalna temperatura do zbiorów |
| `potrzeba_deszcz` | bool | Czy gatunek wymaga niedawnych opadów (ważne dla grzybów!) |
| `trujace` | bool | Czy gatunek jest trujący lub niebezpieczny bez obróbki |
| `ostrzezenie` | string | Ostrzeżenie dotyczące mylących sobowtórów lub toksyczności |
| `ochrona` | string | Info o ochronie gatunkowej ("brak" lub opis) |
| `img_search` | string | Fraza do szukania zdjęcia (używaj w Wikipedia API) |
| `lokalizacje` | string | Sugestie lokalizacji z całej Polski oddzielone `|` |
| `trudnosc` | string | "łatwy" / "sredni" / "trudny" / "NIE ZBIERAJ" |

---

## 4. ARCHITEKTURA APLIKACJI

### Typ: Progressive Web App (PWA)
- Działa w przeglądarce mobilnej bez instalacji ze sklepu
- Po pierwszym załadowaniu działa **offline** (Service Worker + Cache API)
- Możliwość "Dodaj do ekranu głównego" na Androidzie i iOS
- **Brak backendu — aplikacja w 100% front-end**

### Struktura plików:
```
lesny-asystent/
├── index.html              # Główny plik aplikacji (cała logika)
├── manifest.json           # Konfiguracja PWA
├── service-worker.js       # Obsługa offline i cache
├── data/
│   └── species.json        # Baza gatunków (aktualizowalna bez rebuild)
├── assets/
│   └── icons/              # Ikony PWA (192x192, 512x512)
└── DOKUMENTACJA.md         # Ten plik
```

### Uwaga dot. bazy danych:
Baza może być wbudowana bezpośrednio w `index.html` jako `const BAZA = [...]` (prostsze, działa offline od razu) **lub** ładowana z zewnętrznego `data/species.json` (lepsze do aktualizacji). Wybierz podejście z zewnętrznym plikiem jeśli planujesz rozbudowę do 500+ gatunków.

---

## 5. EKRANY NAWIGACJI (5 zakładek)

### Dolna nawigacja (fixed bottom bar):

```
[ 🧭 Predykcja ] [ 📖 Atlas ] [ 🗺️ Mapa ] [ 📍 Znaleziska ] [ ⚙️ Ustawienia ]
```

---

### ZAKŁADKA 1: PREDYKCJA (Główna)
**Co robi:** Pokazuje tylko gatunki aktywne TERAZ — filtrowane przez algorytm fenologiczny.

**Zawiera:**
- Widget pogodowy w nagłówku: temperatura, deszcz, miesiąc — dane z Open-Meteo
- Hero card z opisem aktualnych warunków ("Warunki idealne dla grzybów" itp.)
- Kafelki gatunków z badge'em statusu: `ZBIERAJ TERAZ` / `PRZYGOTUJ SIĘ` / `KOŃCÓWKA ZBIORÓW`
- Pasek wyszukiwania (po `nazwa_pl` i `nazwa_lat`) z autocomplete
- Filtry kategorii (poziomy scroll): Wszystko / Warzywa i Zioła / Lecznicze / Kwiaty / Owoce / Drzewa / Grzyby / Wodne / Porosty / Trujące
- Komunikat "Brak aktywnych zbiorów" gdy nic nie pasuje do filtrów
- Każda karta: zdjęcie z Wikipedia, badge statusu, pasek progresu %, ostrzeżenie toksyczne jeśli `trujace: true`

---

### ZAKŁADKA 2: ATLAS
**Co robi:** Pełny katalog wszystkich 120 gatunków niezależnie od sezonu.

**Zawiera:**
- Identyczne filtry kategorii jak Predykcja
- Identyczna wyszukiwarka
- Pełne karty gatunków: zdjęcie, sezon, przepis, właściwości lecznicze, lokalizacje
- Zdjęcia pobierane z Wikipedia API (lazy-loaded)
- Badge statusu aktualności zbiorów (nawet poza sezonem pokazuje "POZA SEZONEM")
- Pole `ochrona` jeśli różne od "brak" — wyświetl jako ostrzeżenie

---

### ZAKŁADKA 3: MAPA
**Co robi:** Interaktywna mapa z lokalizacjami zbiorów i znaleziskami użytkownika.

**Zawiera:**
- Mapa bazowa: **Leaflet.js** + OpenStreetMap (darmowe, offline-friendly)
- Lokalizacja GPS użytkownika (niebieski marker)
- **Pinezki sugerowanych lokalizacji** — generowane z pola `lokalizacje` każdego gatunku:
  - Pole `lokalizacje` zawiera tekstowe opisy oddzielone `|`
  - Przy inicjalizacji mapy dla każdego aktywnego sezonowo gatunku: sparsuj teksty lokalizacji i umieść je na mapie jako grupowane pinezki (per region: Poznań, Mazury, Bieszczady itd.)
  - Kolor pinezki = kategoria gatunku
  - Popup pinezki: nazwa gatunku + status predykcji + przycisk "Szczegóły"
- **Znaleziska użytkownika** — czerwone pinezki z datą i notatką
- Długie przytrzymanie na mapie → formularz dodania znaleziska
- Przełącznik widoku: "Sugestie zbiorów" / "Moje znaleziska" / "Wszystko"

> **Uwaga:** Baza nie zawiera gotowych współrzędnych lat/lon dla lokalizacji — zamiast tego parsuj teksty z pola `lokalizacje` i przypisuj znane współrzędne dla popularnych nazw miejsc (Puszcza Notecka, Bieszczady, Mazury itd.) za pomocą słownika hardcoded lub geocodingu przez Nominatim API (OpenStreetMap, bezpłatne).

---

### ZAKŁADKA 4: ZNALEZISKA
**Co robi:** Prywatny dziennik zbiorów użytkownika.

**Zawiera:**
- Lista znalezisk (data, gatunek, notatka, miniatura zdjęcia, lokalizacja tekstowa)
- Sortowanie: od najnowszego
- Przycisk "+" → formularz dodania znaleziska:
  - Wybór gatunku z listy (autocomplete z bazy)
  - Notatka tekstowa (opcjonalna)
  - Zdjęcie z galerii/aparatu (opcjonalne, zapis base64)
  - GPS pobierany automatycznie
- Usuwanie znaleziska (długie przytrzymanie lub przycisk kosza)
- Zapis: `localStorage` (prosto) lub `IndexedDB` (dla zdjęć base64)
- Statystyki na górze: "Zebrano X gatunków, Y zbiorów łącznie"

---

### ZAKŁADKA 5: USTAWIENIA
**Co robi:** Konfiguracja aplikacji i informacje.

**Zawiera:**
- Imię użytkownika (edytowalne pole, zapisywane w localStorage)
- Domyślna lokalizacja: GPS automatyczny lub ręcznie wpisana nazwa miejscowości
- Sekcja "Baza danych": wersja bazy, liczba gatunków, data ostatniej aktualizacji
- Przycisk "Sprawdź aktualizacje bazy" (fetch `data/species.json`)
- Sekcja "Aplikacja": wersja aplikacji, przycisk "Zainstaluj na telefonie" (PWA install prompt)
- Sekcja "Dane": przycisk eksportu znalezisk (JSON), przycisk usunięcia wszystkich danych
- Stopka z podpisem autora:

```
Deweloper i twórca aplikacji: Mateusz P.
© 2025 | Leśny Asystent Zbieracza v1.0
Dane botaniczne: baza własna 120 gatunków
Zdjęcia: Wikipedia Commons (CC-BY-SA)
Pogoda: Open-Meteo API
```

---

## 6. ALGORYTM FENOLOGICZNY (Silnik Predykcji)

Funkcja `obliczPredykcje(gatunek)` zwraca `{ procent: 0-100, status: string }`.

### Dane wejściowe z bazy:
- `gatunek.sezon_start` — miesiąc początku sezonu (int 1–12)
- `gatunek.sezon_koniec` — miesiąc końca sezonu (int 1–12)
- `gatunek.min_temp` — minimalna temperatura °C
- `gatunek.potrzeba_deszcz` — czy wymaga niedawnych opadów (bool)

### Dane pogodowe (globalne zmienne aktualizowane przez Open-Meteo):
- `weatherStats.avgTemp` — średnia max temperatury z ostatnich 4 dni
- `weatherStats.rainRecent` — suma opadów > 1.5mm z ostatnich 4 dni → true/false
- `weatherStats.heatWave` — którykolwiek dzień > 26°C → true/false

### Logika punktacji:

```javascript
function obliczPredykcje(gatunek) {
  const biezacyMiesiac = new Date().getMonth() + 1; // 1–12
  let punkty = 0;
  let alertKoncowki = false;

  // 1. Sprawdź sezon
  if (biezacyMiesiac >= gatunek.sezon_start && biezacyMiesiac <= gatunek.sezon_koniec) {
    punkty += 50;
    if (biezacyMiesiac === gatunek.sezon_koniec) alertKoncowki = true;
  } else if (biezacyMiesiac === gatunek.sezon_start - 1) {
    punkty += 20; // przygotowanie przed sezonem
  } else {
    return { procent: 0, status: "POZA SEZONEM" };
  }

  // 2. Sprawdź temperaturę
  if (weatherStats.avgTemp >= gatunek.min_temp) {
    punkty += 30;
  } else if (weatherStats.avgTemp >= gatunek.min_temp - 3) {
    punkty += 15;
  }

  // 3. Fala upałów w końcówce sezonu
  if (weatherStats.heatWave && biezacyMiesiac === gatunek.sezon_koniec) {
    alertKoncowki = true;
    punkty -= 15;
  }

  // 4. Deszcz (ważne szczególnie dla grzybów)
  if (gatunek.potrzeba_deszcz) {
    if (weatherStats.rainRecent) {
      punkty += 20;
    } else {
      punkty = Math.min(punkty, 65); // cap bez deszczu
    }
  } else {
    punkty += 20;
  }

  // 5. Wyznacz status
  let status;
  if (alertKoncowki) {
    status = "KOŃCÓWKA ZBIORÓW";
  } else if (punkty >= 85) {
    status = "ZBIERAJ TERAZ";
  } else if (punkty >= 40) {
    status = "PRZYGOTUJ SIĘ";
  } else {
    status = "WARUNKI SŁABE";
  }

  return { procent: Math.max(0, Math.min(100, punkty)), status };
}
```

### Statusy i wygląd:

| Status | Kolor | Zachowanie |
|---|---|---|
| `ZBIERAJ TERAZ` | 🟢 Zielony | Statyczny badge |
| `PRZYGOTUJ SIĘ` | 🟡 Żółty | Statyczny badge |
| `KOŃCÓWKA ZBIORÓW` | 🟠 Pomarańczowy | Badge pulsujący (animacja) |
| `WARUNKI SŁABE` | ⚪ Szary | Pokazywany tylko w Atlasie |
| `POZA SEZONEM` | — | Ukryty na Predykcji, widoczny w Atlasie |

---

## 7. INTEGRACJA POGODOWA

**API:** Open-Meteo (bezpłatne, bez klucza API)

**Endpoint:**
```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &daily=temperature_2m_max,precipitation_sum
  &timezone=Europe/Warsaw
  &past_days=3
```

**Implementacja:**

```javascript
async function pobierzDanePogody() {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${userLat}&longitude=${userLon}` +
      `&daily=temperature_2m_max,precipitation_sum` +
      `&timezone=Europe%2FWarsaw&past_days=3`
    );
    const data = await res.json();
    const temps = data.daily.temperature_2m_max; // array 4 dni
    const rain = data.daily.precipitation_sum;   // array 4 dni

    weatherStats.avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
    weatherStats.rainRecent = rain.reduce((a, b) => a + b, 0) > 1.5;
    weatherStats.heatWave = temps.some(t => t > 26);

    // Zapisz do localStorage jako fallback offline
    localStorage.setItem('weather_cache', JSON.stringify({
      stats: weatherStats, ts: Date.now()
    }));
  } catch (e) {
    // Fallback: dane z cache lub domyślne
    const cache = localStorage.getItem('weather_cache');
    if (cache) weatherStats = JSON.parse(cache).stats;
  }
}
```

**Lokalizacja użytkownika:**

```javascript
let userLat = 52.4064; // domyślnie Poznań
let userLon = 16.9252;

// Spróbuj pobrać GPS
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    pos => { userLat = pos.coords.latitude; userLon = pos.coords.longitude; },
    () => {} // fallback na Poznań
  );
}
```

---

## 8. SYSTEM ZDJĘĆ (Wikipedia API)

**Źródło:** Wikipedia API (bezpłatne, CC-BY-SA)

```javascript
async function pobierzZdjecieZWiki(gatunek, imgElement) {
  if (imgElement.dataset.loaded === "true") return;

  // Użyj pola img_search z rekordu gatunku
  const query = gatunek.img_search || gatunek.nazwa_lat;

  try {
    const url = `https://pl.wikipedia.org/w/api.php` +
      `?action=query&prop=pageimages&format=json` +
      `&piprop=original&titles=${encodeURIComponent(query)}&origin=*`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data.query.pages;
    const page = Object.values(pages)[0];

    if (page?.original?.source) {
      imgElement.src = page.original.source;
      imgElement.dataset.loaded = "true";
    } else {
      imgElement.src = 'assets/placeholder.jpg';
    }
  } catch {
    imgElement.src = 'assets/placeholder.jpg';
  }
}
```

**Ważne:**
- Używaj pola `img_search` z rekordu (zoptymalizowana fraza), nie tylko `nazwa_lat`
- Lazy-load: pobieraj zdjęcia tylko dla kart widocznych na ekranie (IntersectionObserver)
- Atrybucja: pod każdą kartą mały napis "Źródło zdjęcia: Wikipedia Commons / CC-BY-SA"
- Placeholder: zielone tło z emoji gatunku lub generyczny obraz lasu

---

## 9. WYGLĄD I DESIGN

### Styl: Ciemny, leśny, nowoczesny

> **WAŻNE:** Aplikacja ma **ciemny motyw (dark theme)** — zielono-czarny, organiczny, nowoczesny. NIE jasny/biały.

**Paleta kolorów (CSS variables):**
```css
:root {
  --bg:          #0f1a0f;  /* Bardzo ciemna zieleń — tło główne */
  --bg2:         #162016;  /* Nieco jaśniejsze — tło kart, paneli */
  --bg3:         #1e2d1e;  /* Jeszcze jaśniejsze — inputy, badges tło */
  --card:        #1a271a;  /* Kolor kart gatunków */
  --green:       #4caf50;  /* Główny akcent zielony */
  --green-light: #81c784;  /* Jasniejszy akcent, teksty pomocnicze */
  --green-dim:   #2e7d32;  /* Przytłumiona zieleń, tła akcji */
  --amber:       #ffb300;  /* Kolor ostrzeżeń, "przygotuj się" */
  --red:         #ef5350;  /* Alerty toksyczne, "końcówka zbiorów" */
  --text:        #e8f5e9;  /* Główny tekst — jasna zieleń/biel */
  --text2:       #a5d6a7;  /* Tekst pomocniczy */
  --text3:       #6a8f6b;  /* Tekst trzeciorzędny, placeholdery */
  --border:      rgba(255,255,255,0.07); /* Krawędzie kart */
}
```

**Typografia:**
- Nagłówki i nazwy gatunków: **Playfair Display** (serif, elegancka) — z Google Fonts
- Reszta interfejsu: **DM Sans** (sans-serif, czytelna) — z Google Fonts
- Nazwy łacińskie: kursywa, kolor `var(--text3)`
- Kategorie: uppercase, mały rozmiar, kolor `var(--green-light)`

**Komponenty:**
- Karty gatunków: `border-radius: 24px`, ciemne tło `var(--card)`, subtelna krawędź `var(--border)`
- Filtry kategorii: poziomy scroll (scrollbar ukryty), pill buttons z aktywnym stanem
- Nawigacja dolna: fixed, ciemne tło z blur/frosted glass effect
- Header: sticky, z efektem blur
- Pasek progresu predykcji: gradient zielony, pod każdą kartą
- Badge statusu: kolorowe tło + tekst, "KOŃCÓWKA ZBIORÓW" z animacją pulsowania
- Alert toksyczny: czerwone tło `rgba(239,83,80,0.08)`, czerwona ramka, ikona ⚠️

**Animacje:**
- Karty wchodzą z animacją `fadeUp` (opacity 0→1 + translateY 16px→0)
- Stagger delay dla kolejnych kart (+30ms każda)
- Drawer (szczegóły gatunku) wysuwa się od dołu `translateY(100%→0)`
- Badge "KOŃCÓWKA ZBIORÓW" pulsuje (opacity 1→0.6)

**Ikony:** Emoji (bez zewnętrznych bibliotek) lub Font Awesome 6 (CDN)

---

## 10. KARTY GATUNKÓW — SZCZEGÓŁY

### Karta na liście (kompaktowa):
```
[ Zdjęcie 76x76 ] [ Kategoria uppercase ]              [ ❤️ Ulubione ]
                   [ Nazwa polska — Playfair Display ]
                   [ nazwa łacińska — kursywa ]
                   [ Badge: ZBIERAJ TERAZ ] [ Szczyt: kwiecień–maj ]
--- pasek progresu -----------------------------------------------
[ ⚠️ Alert toksyczny jeśli trujace: true ]
```

### Drawer szczegółów (po kliknięciu karty):
Wysuwa się od dołu ekranu, zawiera:
- Zdjęcie pełna szerokość (200px wysokość)
- Nazwa polska (duża) + łacińska
- Badges: kategoria, status predykcji, trudność zbioru
- Sekcje (każda z nagłówkiem):
  - **Jadalne części** (`jadalne`)
  - **Zastosowanie kulinarne** (`kulinarne`) + **Przepis** (`przepis`)
  - **Właściwości lecznicze** (`lecznicze`)
  - **Gdzie szukać w Polsce** (`lokalizacje`) — sformatowane z `|` jako separatorem
  - **Środowisko** (`wystepowanie`)
  - ⚠️ **Ostrzeżenie** (`ostrzezenie`) — jeśli niepuste
  - 💡 **Ciekawostka** (`ciekawostka`) — wyróżniona zielona ramka
  - 🔒 **Ochrona gatunkowa** (`ochrona`) — jeśli różna od "brak"
- Atrybucja zdjęcia: "Źródło: Wikipedia Commons / CC-BY-SA"

---

## 11. SYSTEM OFFLINE I PWA

### Service Worker — strategia cache-first:
```javascript
// service-worker.js
const CACHE_NAME = 'lesny-asystent-v1';
const ASSETS = [
  '/', '/index.html', '/manifest.json',
  '/data/species.json',
  'https://fonts.googleapis.com/...',
  // Leaflet CSS/JS
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

### Aktualizacja bazy bez rebuild:
Struktura `data/species.json`:
```json
{
  "version": "1.0",
  "updated": "2025-01-01",
  "count": 120,
  "species": [ ...tablica 120 gatunków... ]
}
```

Przy starcie: porównaj `version` z localStorage — jeśli nowsza, zaktualizuj cache.

### Manifest PWA (`manifest.json`):
```json
{
  "name": "Leśny Asystent Zbieracza",
  "short_name": "Zbieracz",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f1a0f",
  "theme_color": "#1a2e1a",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 12. SYSTEM ZNALEZISK

### Struktura znaleziska (localStorage / IndexedDB):
```json
{
  "id": "uuid-v4",
  "gatunek_id": 18,
  "gatunek_nazwa": "Czosnek niedźwiedzi",
  "data": "2025-04-20",
  "godzina": "14:32",
  "lat": 52.1234,
  "lon": 16.5678,
  "lokalizacja_nazwa": "Mosina, Puszcza Rogalińska",
  "notatka": "Duży płat przy ścieżce, idealny do zebrania",
  "zdjecie_base64": "data:image/jpeg;base64,..."
}
```

### Przepływ dodawania znaleziska:
1. Klik "+" w zakładce Znaleziska LUB długie przytrzymanie na mapie
2. Formularz: wybór gatunku z autocomplete + notatka + zdjęcie (opcjonalne)
3. GPS pobierany automatycznie
4. Zapis do localStorage (lub IndexedDB dla zdjęć)
5. Pinezka pojawia się na mapie + element na liście znalezisk

---

## 13. ONBOARDING (Pierwsze uruchomienie)

Wyświetlany jednorazowo, flaga: `localStorage.getItem('onboarding_done') === 'true'`

**Slajd 1:** Logo + nazwa + tagline "Twój leśny przewodnik"
**Slajd 2:** Prośba o imię użytkownika (opcjonalne, pole tekstowe)
**Slajd 3:** Prośba o GPS — wyjaśnienie po co (dokładniejsza predykcja pogodowa)
**Slajd 4:** Skrót po 3 funkcjach: Predykcja / Atlas / Znaleziska
**Slajd 5:** Przycisk "Zaczynamy!" → przejście do aplikacji

Po zakończeniu: `localStorage.setItem('onboarding_done', 'true')`

---

## 14. STOS TECHNOLOGICZNY

| Warstwa | Technologia | Źródło |
|---|---|---|
| HTML/CSS | Własny CSS z variables | Brak frameworka CSS |
| Czcionki | Playfair Display + DM Sans | Google Fonts CDN |
| Ikony | Emoji lub Font Awesome 6 | CDN (opcjonalnie) |
| Mapy | Leaflet.js 1.9 + OpenStreetMap | CDN + darmowe |
| Pogoda | Open-Meteo API | Bez klucza, bezpłatne |
| Zdjęcia | Wikipedia API | Bez klucza, CC-BY-SA |
| Offline | Service Worker + Cache API | Natywne API |
| Dane lokalne | localStorage + IndexedDB | Natywne API |
| Hosting | GitHub Pages / Netlify | Statyczny, bezpłatny |

**Brak backendu. Brak Node.js. Brak npm. Czysty HTML+CSS+JS.**

---

## 15. PLAN IMPLEMENTACJI (kolejność dla Claude Code)

### Krok 1 — Struktura i dane
- [ ] Utwórz strukturę katalogów
- [ ] Skopiuj `baza_js.json` → `data/species.json` (z wrapperem `version`/`species`)
- [ ] Stwórz `index.html` z CSS variables, czcionkami, layoutem i dolną nawigacją

### Krok 2 — Logika rdzenia
- [ ] Funkcja `pobierzDanePogody()` — Open-Meteo API + GPS fallback Poznań
- [ ] Funkcja `obliczPredykcje(gatunek)` — algorytm z sekcji 6
- [ ] Funkcja `pobierzZdjecieZWiki(gatunek, imgEl)` — Wikipedia API
- [ ] Funkcja `renderujKarte(gatunek, predykcja)` — zwraca HTML karty

### Krok 3 — Zakładki (w kolejności priorytetu)
- [ ] **Predykcja** — lista aktywnych + filtry + wyszukiwarka
- [ ] **Atlas** — pełna lista + te same filtry
- [ ] **Znaleziska** — lista + formularz dodawania
- [ ] **Mapa** — Leaflet + pinezki + znaleziska
- [ ] **Ustawienia** — imię + wersja + stopka

### Krok 4 — PWA
- [ ] `manifest.json` z ikonami
- [ ] `service-worker.js` — cache-first strategy
- [ ] Rejestracja Service Workera w `index.html`

### Krok 5 — Szlify
- [ ] Onboarding (jednorazowy, 5 slajdów)
- [ ] Animacje kart (fadeUp, stagger)
- [ ] Drawer szczegółów gatunku (slide-up)
- [ ] Toast notifications
- [ ] Stopka z podpisem autora w Ustawieniach
- [ ] Testy na urządzeniu Android (Chrome)

---

## 16. UWAGI DODATKOWE DLA CLAUDE CODE

### Wydajność:
- Baza ma 120 rekordów — renderuj lazy (nie wszystkich naraz przy starcie)
- Zdjęcia z Wikipedia: użyj `IntersectionObserver` — ładuj tylko widoczne karty
- Wyszukiwarka: debounce 200ms na input

### Kategoryzacja filtrów:
Pole `kategoria` w bazie ma wartości: `"Rośliny zielne"`, `"Rośliny lecznicze"`, `"Kwiaty jadalne"`, `"Owoce dzikie"`, `"Drzewa jadalne"`, `"Grzyby"`, `"Rośliny wodne"`, `"Porosty"`, `"Rośliny TRUJĄCE"`.

Filtry UI możesz grupować np. "Warzywa i Zioła" = `Rośliny zielne` + `Rośliny lecznicze`.

### Obsługa `trujace: true`:
- Zawsze pokazuj ostrzeżenie na karcie jeśli `trujace === true`
- Dla kategorii `"Rośliny TRUJĄCE"` — dodaj specjalny styl (czerwona ramka) i etykietę "EDUKACYJNIE"
- Gatunki z `trudnosc === "NIE ZBIERAJ"` — wyraźne oznaczenie zakazu

### Obsługa `ochrona`:
Jeśli `ochrona !== "brak"` — wyświetl w kolorze bursztynowym z ikoną 🔒.

### Mapa — słownik współrzędnych:
Ponieważ baza nie ma lat/lon, utwórz hardcoded słownik kluczowych lokalizacji:
```javascript
const LOKALIZACJE_COORDS = {
  "Puszcza Notecka": [52.7, 16.1],
  "Puszcza Zielonka": [52.52, 17.08],
  "Bieszczady": [49.1, 22.5],
  "Mazury": [53.8, 21.5],
  "Tatry": [49.2, 19.9],
  "Białowieża": [52.7, 23.85],
  "Bory Tucholskie": [53.7, 17.9],
  "Dolina Baryczy": [51.5, 17.5],
  "Rogalin": [52.2, 17.0],
  // itd.
};
```

---

## 17. STOPKA AUTORA

We wszystkich odpowiednich miejscach (Ustawienia, dolna stopka jeśli jest):

```
Deweloper i twórca aplikacji: Mateusz P.
© 2025 | Leśny Asystent Zbieracza
```

---

*Dokumentacja v3.0 — kompletna specyfikacja do implementacji w Claude Code.*
*Baza 120 gatunków gotowa. Kod startowy z prototypu w skypt.docx.*
*Deweloper i twórca aplikacji: **Mateusz P.***
