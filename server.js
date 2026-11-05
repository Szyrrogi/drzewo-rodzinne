'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Na hostingu (np. Render) ustaw DRZEWO_HOST=0.0.0.0, żeby serwer był dostępny z zewnątrz
const HOST = process.env.DRZEWO_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_PATH = path.join(__dirname, 'data', 'drzewo.db');
const MAX_BODY_BYTES = 100 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Etykieta z formularza -> rodzaj powiązania i płeć nowej osoby
// (kind liczony względem osoby, przy której kliknięto "Dodaj krewnego")
const RELATIVE_LABELS = {
  brat: { kind: 'sibling', gender: 'M' },
  siostra: { kind: 'sibling', gender: 'K' },
  syn: { kind: 'child', gender: 'M' },
  corka: { kind: 'child', gender: 'K' },
  tata: { kind: 'parent', gender: 'M' },
  mama: { kind: 'parent', gender: 'K' },
  maz: { kind: 'spouse', gender: 'M' },
  zona: { kind: 'spouse', gender: 'K' },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- baza danych ----------

if (!process.env.DRZEWO_HASLO || !process.env.DRZEWO_HASLO_ODCZYT) {
  console.error('Ustaw zmienne środowiskowe DRZEWO_HASLO (edycja) i DRZEWO_HASLO_ODCZYT (oglądanie), zanim uruchomisz serwer.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const isNewDb = !fs.existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gender TEXT,
    photo TEXT,
    birth TEXT,
    death TEXT,
    description TEXT NOT NULL DEFAULT '',
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0
  );
  -- parent: a jest rodzicem b; spouse/sibling: symetryczne
  CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    a_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    b_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('parent', 'spouse', 'sibling'))
  );
  CREATE INDEX IF NOT EXISTS relations_a ON relations (a_id);
  CREATE INDEX IF NOT EXISTS relations_b ON relations (b_id);
`);

const stmt = {
  allPeople: db.prepare('SELECT * FROM people ORDER BY id'),
  allRelations: db.prepare('SELECT * FROM relations ORDER BY id'),
  person: db.prepare('SELECT * FROM people WHERE id = ?'),
  insertPerson: db.prepare(
    'INSERT INTO people (name, gender, photo, birth, death, description, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  updatePerson: db.prepare(
    'UPDATE people SET name = ?, gender = ?, photo = ?, birth = ?, death = ?, description = ?, x = ?, y = ? WHERE id = ?',
  ),
  updatePosition: db.prepare('UPDATE people SET x = ?, y = ? WHERE id = ?'),
  restorePerson: db.prepare(
    'INSERT INTO people (id, name, gender, photo, birth, death, description, x, y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ),
  restoreRelation: db.prepare('INSERT INTO relations (id, a_id, b_id, kind) VALUES (?, ?, ?, ?)'),
  deletePerson: db.prepare('DELETE FROM people WHERE id = ?'),
  insertRelation: db.prepare('INSERT INTO relations (a_id, b_id, kind) VALUES (?, ?, ?)'),
  deleteRelation: db.prepare('DELETE FROM relations WHERE id = ?'),
  findParent: db.prepare("SELECT 1 FROM relations WHERE kind = 'parent' AND a_id = ? AND b_id = ?"),
  findSymmetric: db.prepare(
    'SELECT 1 FROM relations WHERE kind = ? AND ((a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?))',
  ),
  parentsOf: db.prepare("SELECT a_id AS id FROM relations WHERE kind = 'parent' AND b_id = ?"),
  childrenOf: db.prepare("SELECT b_id AS id FROM relations WHERE kind = 'parent' AND a_id = ?"),
  spousesOf: db.prepare(
    "SELECT CASE WHEN a_id = ? THEN b_id ELSE a_id END AS id FROM relations WHERE kind = 'spouse' AND (a_id = ? OR b_id = ?)",
  ),
};

function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function addRelation(a, b, kind) {
  if (a === b) return;
  const exists = kind === 'parent'
    ? stmt.findParent.get(a, b)
    : stmt.findSymmetric.get(kind, a, b, b, a);
  if (!exists) stmt.insertRelation.run(a, b, kind);
}

// Podpina nową osobę do osoby "anchor" i uzupełnia brakujące powiązania
// (np. nowe dziecko dostaje też drugiego rodzica, czyli małżonka anchora).
function linkRelative(anchorId, newId, kind) {
  switch (kind) {
    case 'sibling': {
      const parents = stmt.parentsOf.all(anchorId);
      if (parents.length) {
        for (const p of parents) addRelation(p.id, newId, 'parent');
      } else {
        addRelation(anchorId, newId, 'sibling');
      }
      break;
    }
    case 'child':
      addRelation(anchorId, newId, 'parent');
      for (const s of stmt.spousesOf.all(anchorId, anchorId, anchorId)) addRelation(s.id, newId, 'parent');
      break;
    case 'parent':
      addRelation(newId, anchorId, 'parent');
      break;
    case 'spouse':
      addRelation(anchorId, newId, 'spouse');
      for (const c of stmt.childrenOf.all(anchorId)) addRelation(newId, c.id, 'parent');
      break;
    default:
      throw new HttpError(400, 'Nieznany rodzaj powiązania');
  }
}

function seed() {
  tx(() => {
    const person = (name, gender, x, y) =>
      Number(stmt.insertPerson.run(name, gender, null, null, null, '', x, y).lastInsertRowid);
    const adam = person('Adam Różanowski', 'M', 0, 0);
    const lucyna = person('Lucyna Różanowska', 'K', 240, 0);
    const igor = person('Igor Różanowski', 'M', 120, 216);
    const nadia = person('Nadia Różanowska', 'K', 360, 216);
    addRelation(adam, lucyna, 'spouse');
    for (const child of [igor, nadia]) {
      addRelation(adam, child, 'parent');
      addRelation(lucyna, child, 'parent');
    }
  });
}

if (isNewDb) seed();

// ---------- walidacja ----------

// Data może być niepełna: RRRR, RRRR-MM albo RRRR-MM-DD
const isDate = (v) => typeof v === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v);

function finiteOr(value, fallback) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanPerson(input) {
  const name = String(input.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Imię i nazwisko jest wymagane');
  if (name.length > 200) throw new HttpError(400, 'Imię i nazwisko jest za długie');
  if ((input.birth && !isDate(input.birth)) || (input.death && !isDate(input.death))) {
    throw new HttpError(400, 'Daty wpisz jako RRRR, RRRR-MM lub RRRR-MM-DD');
  }
  return {
    name,
    gender: input.gender === 'M' || input.gender === 'K' ? input.gender : null,
    photo: typeof input.photo === 'string' && input.photo.startsWith('data:image/') ? input.photo : null,
    birth: isDate(input.birth) ? input.birth : null,
    death: isDate(input.death) ? input.death : null,
    description: String(input.description ?? '').slice(0, 10000),
    x: finiteOr(input.x, 0),
    y: finiteOr(input.y, 0),
  };
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Nieprawidłowe ID');
  return id;
}

// ---------- operacje ----------

function getTree() {
  return { people: stmt.allPeople.all(), relations: stmt.allRelations.all() };
}

function createPerson(body) {
  const data = cleanPerson(body);
  let relative = null;
  if (body.relative) {
    const label = RELATIVE_LABELS[body.relative.label];
    const anchorId = parseId(body.relative.anchorId);
    if (!label) throw new HttpError(400, 'Nieznane pokrewieństwo');
    if (!stmt.person.get(anchorId)) throw new HttpError(400, 'Nie ma osoby, względem której dodajesz krewnego');
    relative = { anchorId, kind: label.kind, gender: label.gender };
  }
  return tx(() => {
    const gender = relative ? relative.gender : data.gender;
    const id = Number(
      stmt.insertPerson.run(data.name, gender, data.photo, data.birth, data.death, data.description, data.x, data.y)
        .lastInsertRowid,
    );
    if (relative) linkRelative(relative.anchorId, id, relative.kind);
    return { id };
  });
}

function updatePerson(id, body) {
  const current = stmt.person.get(id);
  if (!current) throw new HttpError(404, 'Nie ma takiej osoby');
  const d = cleanPerson({ ...current, ...body });
  stmt.updatePerson.run(d.name, d.gender, d.photo, d.birth, d.death, d.description, d.x, d.y, id);
  return {};
}

function deletePerson(id) {
  if (!stmt.person.get(id)) throw new HttpError(404, 'Nie ma takiej osoby');
  stmt.deletePerson.run(id);
  return {};
}

// Zbiorczy zapis pozycji (przycisk "Ułóż drzewo")
function savePositions(list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Nieprawidłowe pozycje');
  tx(() => {
    for (const item of list) {
      const id = parseId(item.id);
      if (stmt.person.get(id)) stmt.updatePosition.run(finiteOr(item.x, 0), finiteOr(item.y, 0), id);
    }
  });
  return {};
}

function createRelation(body) {
  if (!['parent', 'spouse', 'sibling'].includes(body.kind)) throw new HttpError(400, 'Nieznany rodzaj powiązania');
  const a = parseId(body.a);
  const b = parseId(body.b);
  if (a === b || !stmt.person.get(a) || !stmt.person.get(b)) throw new HttpError(400, 'Nieprawidłowe osoby');
  tx(() => addRelation(a, b, body.kind));
  return {};
}

// Zastępuje całą bazę kopią z GET /api/tree (osoby ze zdjęciami i powiązania)
function restoreTree(body) {
  if (!Array.isArray(body.people) || !Array.isArray(body.relations)) {
    throw new HttpError(400, 'Nieprawidłowy plik kopii');
  }
  tx(() => {
    db.exec('DELETE FROM relations; DELETE FROM people;');
    for (const p of body.people) {
      const d = cleanPerson(p);
      stmt.restorePerson.run(parseId(p.id), d.name, d.gender, d.photo, d.birth, d.death, d.description, d.x, d.y);
    }
    for (const r of body.relations) {
      if (!['parent', 'spouse', 'sibling'].includes(r.kind)) throw new HttpError(400, 'Nieznany rodzaj powiązania');
      stmt.restoreRelation.run(parseId(r.id), parseId(r.a_id), parseId(r.b_id), r.kind);
    }
  });
  return { people: body.people.length, relations: body.relations.length };
}

function deleteRelation(id) {
  stmt.deleteRelation.run(id);
  return {};
}

// ---------- HTTP ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Dane są za duże'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new HttpError(400, 'Nieprawidłowe dane JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Hasło do zapisów. Ustaw zmienną DRZEWO_HASLO, żeby nie trzymać hasła w kodzie.
const EDIT_PASSWORD = process.env.DRZEWO_HASLO;

async function handleApi(req, url) {
  const [, resource, rawId] = url.pathname.split('/').filter(Boolean);
  const { method } = req;

  if (resource === 'auth' && method === 'POST') {
    const body = await readBody(req);
    if (body.haslo !== EDIT_PASSWORD) throw new HttpError(403, 'Złe hasło');
    return {};
  }
  // Odczyt jest publiczny, każdy zapis wymaga hasła w nagłówku X-Haslo
  if (method !== 'GET' && req.headers['x-haslo'] !== EDIT_PASSWORD) {
    throw new HttpError(403, 'Potrzebne hasło do edycji');
  }

  if (resource === 'tree' && method === 'GET' && !rawId) return getTree();
  if (resource === 'positions' && method === 'POST' && !rawId) return savePositions((await readBody(req)).positions);
  if (resource === 'relations' && method === 'POST' && !rawId) return createRelation(await readBody(req));
  if (resource === 'restore' && method === 'POST' && !rawId) return restoreTree(await readBody(req));
  if (resource === 'people' && method === 'POST' && !rawId) return createPerson(await readBody(req));
  if (resource === 'people' && method === 'PUT' && rawId) return updatePerson(parseId(rawId), await readBody(req));
  if (resource === 'people' && method === 'DELETE' && rawId) return deletePerson(parseId(rawId));
  if (resource === 'relations' && method === 'DELETE' && rawId) return deleteRelation(parseId(rawId));
  throw new HttpError(404, 'Nie znaleziono');
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function serveStatic(pathname, res) {
  const relPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = path.normalize(path.join(PUBLIC_DIR, relPath));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(404, 'Nie znaleziono');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nie znaleziono');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

// Hasło do oglądania drzewa. Ustaw DRZEWO_HASLO_ODCZYT, żeby nie trzymać go w kodzie.
const VIEW_PASSWORD = process.env.DRZEWO_HASLO_ODCZYT;
const SESSION_COOKIE = 'drzewo_sesja';
const sessions = new Set();

function isLoggedIn(req) {
  const match = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${SESSION_COOKIE}=`));
  return Boolean(match) && sessions.has(match.slice(SESSION_COOKIE.length + 1));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  try {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.haslo !== VIEW_PASSWORD) throw new HttpError(403, 'Złe hasło');
      const token = crypto.randomBytes(24).toString('hex');
      sessions.add(token);
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`);
      sendJson(res, 200, {});
      return;
    }
    // Bez zalogowania nic nie jest dostępne: ani dane, ani strona drzewa
    if (!isLoggedIn(req)) {
      if (url.pathname.startsWith('/api/')) throw new HttpError(401, 'Najpierw wpisz hasło do drzewa');
      serveStatic('/login.html', res);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(res, 200, await handleApi(req, url));
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metoda niedozwolona');
    serveStatic(url.pathname, res);
  } catch (err) {
    if (err instanceof HttpError) {
      sendJson(res, err.status, { error: err.message });
      return;
    }
    console.error(err);
    sendJson(res, 500, { error: 'Błąd serwera' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Drzewo rodzinne działa: http://${HOST}:${PORT}`);
  console.log(`Baza danych: ${DB_PATH}`);
});
