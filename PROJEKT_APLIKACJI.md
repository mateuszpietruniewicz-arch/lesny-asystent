# Dokumentacja Projektowa: Forest Assistant App
## 1. Wizja i Cel Projektu
Aplikacja Forest Assistant to inteligentny, cyfrowy asystent terenowy i atlas roślin oraz grzybów jadalnych. Jej głównym zadaniem jest automatyczne analizowanie warunków pogodowych oraz kalendarza, aby precyzyjnie informować użytkownika (oraz grono jego znajomych), kiedy i gdzie w Polsce (ze szczególnym uwzględnieniem okolic Poznania do 100 km) dana roślina jest idealna do zbioru. Aplikacja ma formę dynamiczną – wysyła alerty i aktualne cynki z terenu (Hot News), eliminując potrzebę wertowania statycznych książek.

## 2. Żelazne Zasady Projektowe (Zawsze Aktualne)
- Styl Języka: Język całkowicie konkretny, techniczny i zorientowany na fakty. Absolutny zakaz stosowania lania wody, poetyckich uniesień czy infantylnych i emocjonalnych opisów ziół. Zero słów-zapychaczy.
- Architektura Modularna (Maksymalne Rozbicie): Całkowity zakaz tworzenia jednego, monolitycznego pliku. Kod musi być bezwzględnie podzielony na niezależne warstwy: index.html (czysty szkielet), css/style.css (wygląd), js/app.js (logika, API, GPS), data/species.json (czyste dane tekstowe w JSON).
- Infrastruktura i Prywatność: Brak zewnętrznych baz i brak logowania Google. Wszystko działa lokalnie na urządzeniu (LocalStorage).
- Dystrybucja: PWA (Progressive Web App) instalowane z poziomu przeglądarki.

## 3. Szczegółowy Plan Wdrożenia (Roadmap)
- ETAP V1: Baza Startowa i Ratowanie Danych. Oczyszczenie i migracja danych z baza_mobile.html do data/species.json za pomocą Pythona (beautifulsoup4 + ast.literal_eval). Stworzenie wyszukiwarki z autouzupełnianiem od pierwszej litery i kartami z podziałem na 4 grupy: Dzikie warzywa, Zioła, Grzyby, Część lecznicza.
- ETAP V2: Mobilność, Interaktywne Mapy (Leaflet.js + OpenStreetMap) z publicznymi pinezkami i opcją dodawania prywatnych miejscówek do LocalStorage, tryb 100% offline.
- ETAP V3: Inteligencja Pogodowa. API Open-Meteo, wyliczanie Współczynnika Gotowości (Wg) i poranne alerty push (Przygotuj się, Hot News, Końcówka zbiorów).
- ETAP V4: Funkcje Zaawansowane (Dziennik, test sobowtóra, przelicznik wagowy, timer, amoled dark mode).
