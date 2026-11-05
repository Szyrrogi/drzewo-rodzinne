# Drzewo rodzinne

Wizualne drzewo genealogiczne działające w przeglądarce. Dane zapisują się na stałe w bazie SQLite (`data/drzewo.db`).

## Uruchomienie

Wymagany Node.js 22.13 lub nowszy (baza używa wbudowanego modułu `node:sqlite`, nie trzeba nic instalować).

```bash
npm start
```

Następnie otwórz w przeglądarce: http://127.0.0.1:3000

Port można zmienić zmienną środowiskową, np. `PORT=4000 npm start`.

## Obsługa

- **Przesuwanie widoku:** przeciągnij puste tło myszką.
- **Zoom:** kółko myszy (zoom w miejscu kursora).
- **Przenoszenie osób:** przeciągnij kartę. Nowe położenie zapisuje się od razu.
- **Opis osoby:** kliknij kartę. Z prawej pojawi się panel z datami, opisem i powiązaniami.
- **Dodawanie osoby:** przycisk „+ Dodaj osobę”. Pola: imię i nazwisko, zdjęcie (opcjonalne), data urodzenia, data zgonu (opcjonalna), płeć, opis oraz pokrewieństwo (Brat, Siostra, Syn, Córka, Tata, Mama, Mąż, Żona) względem wybranej osoby.
- **Dodawanie krewnego:** w panelu osoby przycisk „+ Dodaj krewnego” ustawia ją jako punkt odniesienia.
- **Powiązania:** przy tworzeniu relacji program sam uzupełnia brakujące połączenia. Np. nowe dziecko dostaje oboje rodziców, a nowy brat/siostra dostaje tych samych rodziców.
- **Szukanie:** wpisz imię lub nazwisko w polu wyszukiwania i naciśnij Enter, aby przejść do osoby.
- **Dopasuj widok:** przycisk pokazuje całe drzewo.
- **Ułóż drzewo:** przycisk ustawia wszystkie karty automatycznie (pokolenia w wierszach, rodzeństwo obok siebie, pary przy sobie, dzieci pod rodzicami). Relacje nie zmieniają się, zmieniają się tylko pozycje kart.

Na starcie baza zawiera model: Adam i Lucyna Różanowscy (małżeństwo, rodzice) oraz ich dzieci Igor i Nadia Różanowscy.

## Dane

- Plik bazy: `data/drzewo.db`. Kopię zapasową wykonasz, kopiując ten plik, gdy serwer jest zatrzymany.
- Baza tworzy się automatycznie przy pierwszym uruchomieniu.
- Zdjęcia są przed zapisem zmniejszane do 256 px i przechowywane w bazie.

## Struktura

- `server.js` – serwer HTTP i API (`/api/tree`, `/api/people`, `/api/relations`), baza SQLite
- `public/index.html`, `public/style.css`, `public/app.js` – interfejs (bez zewnętrznych bibliotek)
- `scripts/import-obrazek.js` – jednorazowy import drzewa z odręcznego szkicu (przy działającym serwerze: `node scripts/import-obrazek.js`). Ponowne uruchomienie nic nie zmienia, jeśli szkic jest już w bazie.

Daty można wpisać jako sam rok (`1922`), rok i miesiąc (`1919-02`) albo pełną datę (`1919-02-26`).

Serwer nasłuchuje tylko na `127.0.0.1`, więc nie jest dostępny z innych komputerów w sieci.
