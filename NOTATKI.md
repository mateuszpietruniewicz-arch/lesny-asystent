# Stan prac nad parsowaniem baza_mobile.html

Skończył nam się limit tokenów w poprzedniej sesji. Jesteśmy w folderze `/Users/mateusz/Desktop/APLIKACJA`.

**Co zostało ustalone i jaka jest strategia:**
1. Plik `baza_mobile.html` zawiera kod Pythona pocięty sztucznie na tagi `<p class="p1">`. Długie linie kodu są rozbite na wiele osobnych tagów `<p>`.
2. Nie używamy już funkcji `eval()` ani skryptów działających czysto znak po znaku.
3. **Nowy Plan:**
   - Wyciągamy surowy tekst ze wszystkich `<p class="p1">` i sklejamy go spacją w jeden długi string (aby naprawić rozbite linie).
   - Wycinamy blok danych od `R = [` do `df = pd.DataFrame`.
   - Dzielimy tekst na rekordy za pomocą wyrażenia regularnego: `re.split(r'(?=\[\d+,)', blok)`.
   - Każdy rekord parsujemy bezpiecznie przez `ast.literal_eval()`.

**Twoje zadanie teraz:**
Napisz skrypt w Pythonie, który zrealizuje powyższy plan, wyciągnie listę gatunków `R` oraz `NAZWY_KOLUMON` i zapisze je do pliku `data/species.json`.
