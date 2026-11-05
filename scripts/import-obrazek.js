'use strict';

// Import drzewa z odręcznego szkicu. Uruchom raz, gdy serwer działa:
//   node scripts/import-obrazek.js
// Skrypt nie importuje ponownie, jeśli znajdzie już "Martynę" w bazie.
// Osoby Adam, Lucyna, Igor i Nadia są już w bazie i zostają użyte.
// Nowe osoby dostają pozycję 0,0 - potem kliknij "Ułóż drzewo".

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

const EXISTING = {
  adam: 'Adam Różanowski',
  lucyna: 'Lucyna Różanowska',
  igor: 'Igor Różanowski',
  nadia: 'Nadia Różanowska',
};

// key: [imię i nazwisko, płeć M/K, data urodzenia (opcjonalnie), opis (opcjonalnie)]
const PEOPLE = {
  // pokolenie 1 (dzieci na samej górze szkicu)
  martyna: ['Martyna', 'K'],
  tymon: ['Tymon', 'M'],
  szymon: ['Szymon', 'M'],
  pawel: ['Paweł', 'M'],
  agata1: ['Agata', 'K'],
  kacper: ['Kacper', 'M'],
  adrian: ['Adrian', 'M'],
  fabian: ['Fabian', 'M'],
  wiktoria: ['Wiktoria', 'K'],
  ignacy: ['Ignacy', 'M'],
  seweryn: ['Seweryn', 'M'],
  augustyn: ['Augustyn', 'M'],
  krystian: ['Krystian', 'M'],
  agata2: ['Agata', 'K'],
  damian: ['Damian', 'M'],
  oliwia: ['Oliwia', 'K'],

  // pokolenie 2
  piotr: ['Piotr', 'M'],
  marzena: ['Marzena', 'K'],
  przemek: ['Przemek', 'M'],
  ciosia: ['Ciosia', 'K'],
  grzegorz: ['Grzegorz', 'M'],
  mariola: ['Mariola', 'K'],
  michal1: ['Michał', 'M'],
  kasia1: ['Kasia', 'K'],
  lukasz: ['Łukasz', 'M'],
  kasia2: ['Kasia', 'K'],
  mateusz1: ['Mateusz', 'M'],
  kamila: ['Kamila', 'K'],
  agnieszka1: ['Agnieszka', 'K'],
  marcin: ['Marcin', 'M'],
  ewa: ['Ewa', 'K'],
  maciej: ['Maciej', 'M'],

  // pokolenie 3
  kazik: ['Kazik', 'M'],
  stanislawa: ['Stanisława', 'K'],
  marian: ['Marian', 'M', null, 'Zmarł w wieku 1 roku.'],
  maria: ['Maria', 'K'],
  ryszard: ['Ryszard', 'M'],
  teresa: ['Teresa', 'K', null, 'Zmarła w wieku 3 lat.'],
  krystyna: ['Krystyna', 'K'],
  eugeniusz: ['Eugeniusz', 'M'],
  henryk: ['Henryk', 'M'],
  irena: ['Irena', 'K'],

  // pokolenie 4
  janina: ['Janina', 'K'],
  stanislaw1: ['Stanisław', 'M'],
  stanislaw2: ['Stanisław', 'M'],
  onufry: ['Onufry', 'M'],
  agnieszka2: ['Agnieszka', 'K', '1922'],
  bronislawa: ['Bronisława', 'K'],
  waclaw: ['Wacław', 'M'],
  wladyslaw: ['Władysław', 'M'],

  // pokolenie 5 (dolna część szkicu - część powiązań do sprawdzenia)
  katarzyna1: ['Katarzyna', 'K'],
  franciszek1: ['Franciszek', 'M'],
  jozefa1: ['Józefa', 'K'],
  wojciech: ['Wojciech Figury', 'M'],
  marianna1: ['Marianna Figury', 'K'],
  adam1919: ['Adam', 'M', '1919-02-26'],
  weronika: ['Weronika Szaja', 'K'],
  franciszek2: ['Franciszek', 'M'],
  jozefa2: ['Józefa', 'K'],
  michal2: ['Michał', 'M'],
  katarzyna2: ['Katarzyna Tomczyk', 'K'],
  mateusz2: ['Mateusz', 'M'],
  jan1: ['Jan Szaja', 'M'],
  anna1: ['Anna Janiec', 'K'],
  klara: ['Klara Bugajska', 'K'],
  tomasz: ['Tomasz Tomczyk', 'M'],

  // pokolenie 6 (najniżej na szkicu)
  jakub: ['Jakub Szaja', 'M'],
  zofia: ['Zofia Małszołowicz', 'K'],
  jan2: ['Jan Janiec', 'M'],
  magdalena: ['Magdalena Strzębek', 'K'],
  franciszek3: ['Franciszek Bugajski', 'M'],
  rozalia: ['Rozalia Jugaszek', 'K'],
  michal3: ['Michał Tomczyk', 'M'],
  marianna2: ['Marianna Marek', 'K'],
};

// Rodzice -> dzieci (wszystkie wymienione osoby z lewej są rodzicami każdego z dzieci)
const FAMILIES = [
  [['piotr', 'marzena'], ['martyna', 'tymon']],
  [['przemek', 'ciosia'], ['szymon']],
  [['adam', 'lucyna'], ['nadia', 'igor']],
  [['grzegorz', 'mariola'], ['pawel', 'agata1']],
  [['michal1', 'kasia1'], ['kacper', 'adrian']],
  [['kasia2', 'lukasz'], ['fabian', 'wiktoria']],
  [['mateusz1', 'kamila'], ['ignacy', 'seweryn', 'augustyn']],
  [['agnieszka1'], ['krystian']],
  [['marcin', 'ewa'], ['agata2', 'damian']],
  [['maciej'], ['oliwia']],

  [['kazik', 'stanislawa'], ['marzena', 'ciosia']],
  [['maria', 'ryszard'], ['lucyna', 'grzegorz', 'michal1']],
  [['krystyna', 'eugeniusz'], ['lukasz', 'mateusz1']],
  [['henryk', 'irena'], ['agnieszka1', 'maciej']],

  [['janina', 'stanislaw1'], ['kazik', 'stanislawa', 'marian', 'maria', 'teresa', 'krystyna', 'henryk']],
  [['jozefa2', 'michal2'], ['stanislaw1', 'waclaw', 'wladyslaw']],
  // Dzieci są u góry szkicu, rodzice niżej
  [['adam1919', 'weronika'], ['janina', 'stanislaw2', 'onufry', 'bronislawa']],
  [['mateusz2', 'katarzyna2'], ['weronika']],
  [['wojciech', 'marianna1'], ['franciszek1', 'katarzyna1', 'jozefa1']],
  [['jakub', 'zofia'], ['jan1']],
  [['jan2', 'magdalena'], ['anna1']],
  [['jan1', 'anna1'], ['mateusz2']],
  [['klara', 'tomasz'], ['katarzyna2']],
  [['franciszek3', 'rozalia'], ['klara']],
  [['michal3', 'marianna2'], ['tomasz']],
];

// Małżeństwa / pary
const COUPLES = [
  ['piotr', 'marzena'],
  ['przemek', 'ciosia'],
  ['grzegorz', 'mariola'],
  ['michal1', 'kasia1'],
  ['kasia2', 'lukasz'],
  ['mateusz1', 'kamila'],
  ['marcin', 'ewa'],
  ['kazik', 'stanislawa'],
  ['ryszard', 'maria'],
  ['krystyna', 'eugeniusz'],
  ['henryk', 'irena'],
  ['janina', 'stanislaw1'],
  ['wojciech', 'marianna1'],
  ['adam1919', 'weronika'],
  ['franciszek2', 'weronika'], // pierwszy związek Weroniki, zakończony rozwodem
  ['michal2', 'jozefa2'],
  ['mateusz2', 'katarzyna2'],
  ['jan1', 'anna1'],
  ['klara', 'tomasz'],
  ['franciszek3', 'rozalia'],
  ['michal3', 'marianna2'],
  ['jakub', 'zofia'],
  ['jan2', 'magdalena'],
];

async function api(method, url, body) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd ${res.status} przy ${method} ${url}`);
  return data;
}

async function main() {
  const tree = await api('GET', '/api/tree');
  if (tree.people.some((p) => p.name === 'Martyna')) {
    console.log('Drzewo z obrazka jest już w bazie. Nic nie zmieniam.');
    return;
  }

  const ids = {};
  for (const [key, name] of Object.entries(EXISTING)) {
    const found = tree.people.find((p) => p.name === name);
    if (!found) throw new Error(`Brak osoby w bazie: ${name}`);
    ids[key] = found.id;
  }

  for (const [key, [name, gender, birth = null, desc = '']] of Object.entries(PEOPLE)) {
    const { id } = await api('POST', '/api/people', { name, gender, birth, description: desc });
    ids[key] = id;
  }

  let relations = 0;
  for (const [parents, children] of FAMILIES) {
    for (const child of children) {
      for (const parent of parents) {
        await api('POST', '/api/relations', { a: ids[parent], b: ids[child], kind: 'parent' });
        relations += 1;
      }
    }
  }
  for (const [a, b] of COUPLES) {
    await api('POST', '/api/relations', { a: ids[a], b: ids[b], kind: 'spouse' });
    relations += 1;
  }

  console.log(`Dodano ${Object.keys(PEOPLE).length} osób i ${relations} powiązań.`);
  console.log('Otwórz aplikację i kliknij „Ułóż drzewo”.');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
