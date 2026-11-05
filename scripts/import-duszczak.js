'use strict';

// Import gałęzi Duszczaków i Różanowskich z arkusza "Drzewo - Duszczak.xlsx".
// Uruchom raz, gdy serwer działa:  node scripts/import-duszczak.js
// Skrypt nic nie kasuje. Istniejące osoby (Zenon, Marysia, Adam, Lucyna, Igor, Nadia,
// Jacek, Lucyna Bartczak, Agata, Daniel) dostają tylko daty i opisy z arkusza.
// Nie są importowane osoby niejasne w arkuszu (patrz komentarz na końcu pliku).

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

// Istniejące osoby w bazie (id) i ich dane z arkusza
const EXISTING = {
  zenon: { id: 7, name: 'Zenon Różanowski', birth: '1949-04-28', description: 'Ur. w Tczewie. Ślub 21.10.1972 r. z Marią Tomaszewską.' },
  marysia: { id: 8, birth: '1947-03-20', description: 'Z domu Tomaszewska. Córka Leokadii Duszczak i Ludwika Tomaszewskiego.' },
  adam: { id: 1, birth: '1977-03-29', description: 'Ślub 17.08.2002 r. z Lucyną Chrzanowską.' },
  lucynaChrz: { id: 2, birth: '1977-04-27', description: 'Z domu Chrzanowska. Mieszka w Tczewie.' },
  igor: { id: 3, birth: '2003-10-15', description: 'Mieszka w Tczewie.' },
  nadia: { id: 4, birth: '2007-06-22', description: 'Mieszka w Tczewie.' },
  jacek: { id: 239, birth: '1973-07-25', description: 'Ślub 15.08.1998 r. z Lucyną Bartczak. Mieszka w Rokitkach, pow. Tczew.' },
  lucynaBart: { id: 240, birth: '1977-12-05', description: 'Z domu Bartczak.' },
  agata: { id: 241, birth: '2006-03-06', description: 'Mieszka w Rokitkach, pow. Tczew.' },
  daniel: { id: 242, birth: '2000-03-08', description: 'Mieszka w Rokitkach, pow. Tczew.' },
};

// key: [imię i nazwisko, płeć, data urodzenia, data zgonu, opis]
const PEOPLE = {
  walentyna: ['Walentyna Duszczak', 'K', null, null, 'Razem z Janem Duszczakiem, rodzice Leokadii, Franciszka i Józefa.'],
  jan: ['Jan Duszczak', 'M', null, null, 'Razem z Walentyną Duszczak.'],

  leokadia: ['Leokadia Duszczak', 'K', '1905-11-06', '1989-08-18', 'Pochowana w Tczewie, woj. pomorskie. Ślub w sierpniu 1938 r. z Ludwikiem Tomaszewskim.'],
  ludwik: ['Ludwik Tomaszewski', 'M', '1900-08-07', '1967-08-19', 'Pochowany w miejscowości Wygoda, parafia Grabowo, woj. wielkopolskie.'],
  feliks: ['Feliks Tomaszewski', 'M', '1939-11-04', '2004-11-19', 'Kawaler, dzieci brak.'],

  franciszek1: ['Franciszek Duszczak', 'M', '1906-12-05', '1993-03-04', 'Razem ze Stefanią pochowani w Wygodzie, parafia Grabowo.'],
  stefaniaK: ['Stefania Duszczak', 'K', '1920-03-19', '2011-02-10', 'Z domu Kaniewska. Pochowana w Wygodzie, parafia Grabowo.'],
  teresa: ['Teresa Duszczak', 'K', '1947-10-14', null, 'Ślub 23.04.1966 r. ze Zdzisławem Bukowieckim. Mieszka w Krzywej Górze, pow. Września.'],
  zdzislaw: ['Zdzisław Bukowiecki', 'M', '1933-07-22', null, 'Mieszka w Krzywej Górze, pow. Września.'],
  roman: ['Roman Bukowiecki', 'M', '1967-02-24', null, 'Ślub 19.11.1994 r. z Hanną Matuszak. Mieszka w Bierzglinku, pow. Września.'],
  hanna: ['Hanna Bukowiecka', 'K', null, null, 'Z domu Matuszak. Mieszka w Bierzglinku.'],
  joanna: ['Joanna Bukowiecka', 'K', '1995-03-17', null, 'Mieszka w Bierzglinku, pow. Września.'],
  magdalena: ['Magdalena Bukowiecka', 'K', '1997-07-08', null, 'Mieszka w Bierzglinku, pow. Września.'],
  weronikaB: ['Weronika Bukowiecka', 'K', '2001-06-12', null, 'Mieszka w Bierzglinku, pow. Września.'],
  ewaB: ['Ewa Bukowiecka', 'K', '1968', '2017-01-18', 'Panna. Pochowana w Grabowie na miejscu pochówku Ludwika Tomaszewskiego, ojca Marii Różanowskiej.'],
  marzenaB: ['Marzena Bukowiecka', 'K', '1975-09-28', null, 'Mieszka w Wrześni, woj. wielkopolskie.'],
  krystianB: ['Krystian Bukowiecki', 'M', '2008-09-26', null, 'Mieszka w Wrześni.'],
  agnieszkaB: ['Agnieszka Bukowiecka', 'K', '1982-04-26', null, 'Mieszka w Krzywej Górze, pow. Września.'],

  jozef: ['Józef Duszczak', 'M', '1910-02-25', '1963-08-25', 'Ślub 25.01.1937 r. (mieszkali w Gorzycach, pow. Września). Pochowany w Biechowie, pow. Września.'],
  helena: ['Helena Duszczak', 'K', '1911-05-23', '1998-10-17', 'Z domu Piszczatowska. Pochowana w Biechowie, pow. Września.'],
  barbara: ['Barbara Duszczak', 'K', '1939-08-18', '1987-01-10', 'Pochowana w Gnieźnie.'],
  elzbieta: ['Elżbieta Krzyżowstaniak', 'K', '1959-11-05', null, 'Ślub 28.01.1978 r. ze Stanisławem Michalakiem. Mieszka w Gnieźnie.'],
  stanislawM: ['Stanisław Michalak', 'M', '1955-11-29', null, 'Mieszka w Gnieźnie.'],
  mariuszM: ['Mariusz Michalak', 'M', '1978-06-27', null, 'Mieszka w Gnieźnie.'],
  adamM: ['Adam Michalak', 'M', '1979-10-20', null, 'Mieszka w Gnieźnie.'],
  genowefa: ['Genowefa Surdyk', 'K', '1945-12-21', null, 'Z domu Duszczak. Ślub 18.07.1970 r. z Władysławem Surdykiem. Mieszka w Kębłowie, gm. Miłosław.'],
  wladyslawS: ['Władysław Surdyk', 'M', '1947-06-09', '2003-09-17', 'Pochowany w Miłosławiu. Mieszkał w Kębłowie, gm. Miłosław.'],
  jaroslaw: ['Jarosław Surdyk', 'M', '1970-04-23', null, 'Ślub 19.06.1993 r. z Wiesławą Sawicką. Mieszka w Kębłowie, gm. Miłosław.'],
  wieslawaS: ['Wiesława Surdyk', 'K', '1973-03-21', null, 'Z domu Sawicka.'],
  karolinaS: ['Karolina Surdyk', 'K', '1995-04-21', null, null],
  krystianS: ['Krystian Surdyk', 'M', '2001-01-19', null, null],
  danuta: ['Danuta Szczepaniak', 'K', '1971-11-03', null, 'Ślub 27.06.1992 r. z Józefem Szczepaniakiem. Mieszka w Miłosławiu.'],
  jozefSz: ['Józef Szczepaniak', 'M', '1953-03-18', null, 'Mieszka w Miłosławiu.'],
  bartek: ['Bartek Szczepaniak', 'M', '1993-01-07', null, null],
  julita: ['Julita Szczepaniak', 'K', '1994-05-08', null, null],
  karolSz: ['Karol Szczepaniak', 'M', '1997-01-02', null, null],
  ewaS: ['Ewa Gilotti', 'K', '1972-12-07', null, 'Z domu Surdyk. Mieszka z mężem w Bawarii (Niemcy).'],
  genaro: ['Genaro Gilotti', 'M', null, null, 'Mieszka z żoną w Bawarii (Niemcy).'],
  alessia: ['Alessia Gilotti', 'K', '2006-10-11', null, null],
  andrzej: ['Andrzej Duszczak', 'M', '1946-11-27', null, 'Żona Marta Jędraszak.'],
  marta: ['Marta Duszczak', 'K', null, null, 'Z domu Jędraszak.'],
  arkadiuszD: ['Arkadiusz Duszczak', 'M', null, null, null],
  annaD: ['Anna Duszczak', 'K', null, null, null],
  agnieszkaD: ['Agnieszka Duszczak', 'K', null, null, null],
  ewaD: ['Ewa Duszczak', 'K', null, null, null],

  zenonD: ['Zenon Duszczak', 'M', '1948-11-21', null, 'Ślub 25.12.1975 r. z Ireną Mikołajewską. Mieszka w Gorzycach, pow. Września.'],
  irena: ['Irena Duszczak', 'K', '1954-02-26', null, 'Z domu Mikołajewska. Mieszka w Gorzycach.'],
  marekD: ['Marek Duszczak', 'M', '1977-02-20', null, 'Ślub z Renatą Olejniczak. Mieszka w Gorzycach.'],
  renata: ['Renata Duszczak', 'K', '1979-01-26', null, 'Z domu Olejniczak.'],
  krzysztofD: ['Krzysztof Duszczak', 'M', '2003', null, 'Mieszka w Gorzycach.'],
  paulinaD: ['Paulina Duszczak', 'K', '2005', null, 'Mieszka w Gorzycach.'],
  przemyslawD: ['Przemysław Duszczak', 'M', '2006', null, 'Mieszka w Gorzycach.'],
  januszD: ['Janusz Duszczak', 'M', '2011', null, 'Mieszka w Gorzycach.'],

  pawel: ['Paweł Różanowski', 'M', '1913', null, 'Urodzony w Tczewie, pochowany na cmentarzu w Miłobądzu.'],
  stefaniaR: ['Stefania Różanowska', 'K', '1915', null, 'Z domu Ciesielska. Pochowana na cmentarzu w Miłobądzu.'],
  urszula: ['Urszula Różanowska', 'K', '1942', null, 'Urodzona w Korczewie (Generalna Gubernia).'],
  wieslawaR: ['Wiesława Różanowska', 'K', '1958', null, 'Urodzona w Pszczółkach, pow. Tczew.'],
};

// Rodzice -> dzieci (dzieci są na górze arkusza, rodzice niżej, tu zapisane normalnie)
const FAMILIES = [
  [['walentyna', 'jan'], ['leokadia', 'franciszek1', 'jozef']],
  [['leokadia', 'ludwik'], ['feliks', 'marysia']],
  [['franciszek1', 'stefaniaK'], ['teresa']],
  [['jozef', 'helena'], ['barbara', 'genowefa', 'andrzej', 'zenonD']],
  [['teresa', 'zdzislaw'], ['roman', 'ewaB', 'marzenaB', 'agnieszkaB']],
  [['roman', 'hanna'], ['joanna', 'magdalena', 'weronikaB']],
  [['marzenaB'], ['krystianB']],
  [['barbara'], ['elzbieta']],
  [['elzbieta', 'stanislawM'], ['mariuszM', 'adamM']],
  [['genowefa', 'wladyslawS'], ['jaroslaw', 'danuta', 'ewaS']],
  [['jaroslaw', 'wieslawaS'], ['karolinaS', 'krystianS']],
  [['danuta', 'jozefSz'], ['bartek', 'julita', 'karolSz']],
  [['ewaS', 'genaro'], ['alessia']],
  [['andrzej', 'marta'], ['arkadiuszD', 'annaD', 'agnieszkaD', 'ewaD']],
  [['zenonD', 'irena'], ['marekD']],
  [['marekD', 'renata'], ['krzysztofD', 'paulinaD', 'przemyslawD', 'januszD']],
  [['pawel', 'stefaniaR'], ['urszula', 'zenon', 'wieslawaR']],
];

// Małżeństwa
const COUPLES = [
  ['walentyna', 'jan'],
  ['leokadia', 'ludwik'],
  ['franciszek1', 'stefaniaK'],
  ['jozef', 'helena'],
  ['teresa', 'zdzislaw'],
  ['roman', 'hanna'],
  ['elzbieta', 'stanislawM'],
  ['genowefa', 'wladyslawS'],
  ['jaroslaw', 'wieslawaS'],
  ['danuta', 'jozefSz'],
  ['ewaS', 'genaro'],
  ['andrzej', 'marta'],
  ['zenonD', 'irena'],
  ['marekD', 'renata'],
  ['pawel', 'stefaniaR'],
  ['zenon', 'marysia'],
];

// Nazwa do sprawdzenia, czy import już był
const MARKER = 'Leokadia Duszczak';

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
  if (tree.people.some((p) => p.name === MARKER)) {
    console.log('Ta gałąź jest już w bazie. Nic nie zmieniam.');
    return;
  }

  const ids = {};
  for (const [key, e] of Object.entries(EXISTING)) {
    const current = tree.people.find((p) => p.id === e.id);
    if (!current) throw new Error(`Brak osoby o id ${e.id} (${key})`);
    const body = { birth: e.birth, description: e.description };
    if (e.name) body.name = e.name;
    await api('PUT', `/api/people/${e.id}`, body);
    ids[key] = e.id;
  }
  ids.marysia = EXISTING.marysia.id;
  ids.zenon = EXISTING.zenon.id;

  for (const [key, [name, gender, birth, death, desc]] of Object.entries(PEOPLE)) {
    const { id } = await api('POST', '/api/people', {
      name,
      gender,
      birth,
      death,
      description: desc ?? '',
    });
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

  console.log(`Dodano ${Object.keys(PEOPLE).length} osób, zaktualizowano ${Object.keys(EXISTING).length}, powiązań: ${relations}.`);
  console.log('Otwórz aplikację i kliknij „Ułóż drzewo”.');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});

// Pominięte, bo niejasne w arkuszu:
// - Michał Chrzanowski (dzieci Wiesi i Gienia Chrzanowskich) - które to Michał z linii taty, a które z linii mamy
// - Ula Sławińska, mąż Eryk, syn Sławomir, jego żona Ela, córka przybrana Wiktoria (notatka przy Danielu)
// - Franciszek, Leokadia i Lena Różanowscy (rodzice Pawła) - brak imion ich rodziców
// - Rodzina Ciesielskich (siostra Ika, brat Edmund z żoną Agnieszką, Helena i Kazimierz z dziećmi)
// - Rodzina Krzyżowstaniak / Michalak - ojciec Elżbiety nie jest podany
// - Hanna Matuszak, Wiesława Sawicka: tylko nazwiska, bez dat
