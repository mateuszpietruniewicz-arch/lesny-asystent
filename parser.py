import ast
import json
import os
from bs4 import BeautifulSoup

COLUMNS = [
    "id", "nazwa_polska", "nazwa_lacinska", "kategoria", "podkategoria",
    "sezon_start", "sezon_koniec", "szczyt_zbioru",
    "min_temp_C", "dni_min_temp", "wilgotnosc",
    "jadalne_czesci", "zastosowanie_kulinarne", "zastosowanie_lecznicze",
    "przepis_sugestia", "wystepowanie_ogolne", "regiony_polski",
    "sugestie_lokalizacji",
    "trujace_surowe", "ostrzezenie", "trudnosc_zbioru",
    "img_search", "ciekawostka", "ochrona"
]

def find_matching_bracket(text, start):
    """Returns index just past the closing ] matching the [ at text[start-1]."""
    depth = 1
    i = start
    in_str = False
    quote_char = None
    while i < len(text) and depth > 0:
        c = text[i]
        if in_str:
            if c == "\\" :
                i += 1  # skip escaped char
            elif c == quote_char:
                in_str = False
        else:
            if c in ('"', "'"):
                in_str = True
                quote_char = c
            elif c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
        i += 1
    return i

def parse():
    with open("baza_mobile.html", encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    # Wyciągnij linie, usuń czyste komentarze Pythona
    lines = [p.get_text() for p in soup.find_all("p", class_="p1")]
    lines = [l for l in lines if not l.strip().startswith("#")]

    # Sklej spacją – odtwarza kod bez łamania stringów
    text = " ".join(lines)

    # Zlokalizuj R = [
    marker = "R = ["
    pos = text.index(marker) + len(marker)

    # Znajdź domknięcie listy z uwzględnieniem zagnieżdżeń i stringów
    end = find_matching_bracket(text, pos)
    inner = text[pos : end - 1].strip()

    # Jeden shot: sparsuj całą listę R
    R = ast.literal_eval("[" + inner + "]")

    records = []
    for row in R:
        if not isinstance(row, list) or len(row) == 0:
            continue
        if len(row) != len(COLUMNS):
            print(f"  UWAGA: rekord #{row[0] if row else '?'} ma {len(row)} pól (oczekiwano {len(COLUMNS)})")
        records.append(dict(zip(COLUMNS, row)))

    os.makedirs("data", exist_ok=True)
    with open("data/species.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Zapisano {len(records)} gatunków → data/species.json")

    from collections import Counter
    cats = Counter(r["kategoria"] for r in records)
    for cat, count in sorted(cats.items()):
        print(f"  {cat}: {count}")

if __name__ == "__main__":
    parse()
