'use strict';

// Wysyła kopię drzewa na serwer (zastępuje jego bazę).
// Kopię zapisz najpierw z przeglądarki: otwórz <adres>/api/tree i zapisz stronę jako kopia.json.
// Użycie (w cmd, z folderu projektu):
//   set DRZEWO_HASLO_ODCZYT=...
//   set DRZEWO_HASLO=...
//   node scripts/wyslij-kopie.js kopia.json https://drzewo-rodzinne.onrender.com

const fs = require('node:fs');

const [file, base] = process.argv.slice(2);
if (!file || !base) {
  console.error('Użycie: node scripts/wyslij-kopie.js kopia.json https://adres-serwera');
  process.exit(1);
}
const viewPass = process.env.DRZEWO_HASLO_ODCZYT;
const editPass = process.env.DRZEWO_HASLO;
if (!viewPass || !editPass) {
  console.error('Ustaw zmienne DRZEWO_HASLO_ODCZYT i DRZEWO_HASLO.');
  process.exit(1);
}

(async () => {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ haslo: viewPass }),
  });
  if (!login.ok) throw new Error('Nie udało się zalogować hasłem do oglądania.');
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const res = await fetch(`${base}/api/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, 'X-Haslo': editPass },
    body: JSON.stringify({ people: data.people, relations: data.relations }),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || `Błąd ${res.status}`);
  console.log(`Wgrano ${result.people} osób i ${result.relations} powiązań.`);
})().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
