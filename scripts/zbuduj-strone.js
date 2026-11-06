'use strict';

// Buduje wersję do oglądania na GitHub Pages (folder docs/).
// Dane z bazy są zaszyfrowane hasłem do oglądania (DRZEWO_HASLO_ODCZYT).
// Użycie: node scripts/zbuduj-strone.js   (po każdej zmianie w drzewie)

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const ITERATIONS = 600000;

const password = process.env.DRZEWO_HASLO_ODCZYT;
if (!password) {
  console.error('Ustaw zmienną DRZEWO_HASLO_ODCZYT (hasło, którym zaszyfrujesz dane).');
  process.exit(1);
}

// Dane w tym samym kształcie, co GET /api/tree
const db = new DatabaseSync(path.join(ROOT, 'data', 'drzewo.db'), { readOnly: true });
const data = {
  people: db.prepare('SELECT * FROM people ORDER BY id').all(),
  relations: db.prepare('SELECT * FROM relations ORDER BY id').all(),
};
db.close();

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([
  cipher.update(JSON.stringify(data), 'utf8'),
  cipher.final(),
  cipher.getAuthTag(),
]);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(
  path.join(OUT, 'drzewo.enc.json'),
  JSON.stringify({
    v: 1,
    iter: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
  }),
);

fs.copyFileSync(path.join(ROOT, 'public', 'app.js'), path.join(OUT, 'app.js'));
fs.copyFileSync(path.join(ROOT, 'public', 'style.css'), path.join(OUT, 'style.css'));
fs.copyFileSync(path.join(__dirname, 'static', 'odszyfruj.js'), path.join(OUT, 'odszyfruj.js'));

// Strona: ta sama, co w aplikacji, ale z ekranem hasła zamiast od razu app.js
const overlay = `
  <div id="odszyfruj-overlay" class="overlay">
    <form id="odszyfruj">
      <h1>Drzewo rodzinne</h1>
      <input name="haslo" type="password" placeholder="Hasło" autocomplete="current-password" required autofocus>
      <button type="submit" class="primary">Wejdź</button>
      <p id="odszyfruj-blad" class="error"></p>
    </form>
  </div>
  <script src="odszyfruj.js"></script>`;
let html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
html = html.replace('<body>', '<body class="static">');
html = html.replace('  <script src="app.js"></script>', overlay);
fs.writeFileSync(path.join(OUT, 'index.html'), html);

console.log(`Zbudowano ${OUT}: ${data.people.length} osób, ${data.relations.length} powiązań.`);
