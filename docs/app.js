(() => {
  'use strict';

  // Wymiary kart i odstępy (w przestrzeni świata, px)
  const CARD_W = 200;
  const CARD_H = 96;
  const COL_GAP = 40;
  const ROW_GAP = 120;
  const ROW_H = CARD_H + ROW_GAP;
  const PANEL_W = 340;
  const MIN_K = 0.1;
  const MAX_K = 3;
  // Kolory linii rodzin leżących w tym samym wierszu blisko siebie
  const LINE_COLORS = ['#2f7a5a', '#3b6fb6', '#b5651d', '#8e44ad', '#c0392b', '#16a085', '#b8860b', '#34495e'];

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'g', 'rect', 'text', 'image', 'clipPath', 'circle', 'path', 'line', 'title']);

  // Pokrewieństwa z formularza: rodzaj relacji i płeć nowej osoby
  const RELATIONS = {
    brat: { label: 'Brat', kind: 'sibling', gender: 'M' },
    siostra: { label: 'Siostra', kind: 'sibling', gender: 'K' },
    syn: { label: 'Syn', kind: 'child', gender: 'M' },
    corka: { label: 'Córka', kind: 'child', gender: 'K' },
    tata: { label: 'Tata', kind: 'parent', gender: 'M' },
    mama: { label: 'Mama', kind: 'parent', gender: 'K' },
    maz: { label: 'Mąż', kind: 'spouse', gender: 'M' },
    zona: { label: 'Żona', kind: 'spouse', gender: 'K' },
  };

  // Nazwy ról w panelu, zależnie od płci osoby
  const ROLE_NAMES = {
    parent: { M: 'Ojciec', K: 'Matka', '': 'Rodzic' },
    child: { M: 'Syn', K: 'Córka', '': 'Dziecko' },
    spouse: { M: 'Mąż', K: 'Żona', '': 'Partner' },
    sibling: { M: 'Brat', K: 'Siostra', '': 'Rodzeństwo' },
  };

  const state = {
    people: new Map(),
    relations: [],
    selectedId: null,
    highlightAll: false,
    search: '',
    view: { x: 0, y: 0, k: 1 },
  };

  const canvas = document.getElementById('canvas');
  const world = document.getElementById('world');
  const edgesLayer = document.getElementById('edges');
  const cardsLayer = document.getElementById('cards');
  const panel = document.getElementById('panel');
  const dialog = document.getElementById('person-dialog');
  const form = document.getElementById('person-form');
  const dialogTitle = document.getElementById('dialog-title');
  const formError = document.getElementById('form-error');
  const relationFields = document.getElementById('relation-fields');
  const photoPreview = document.getElementById('photo-preview');
  const photoFile = document.getElementById('photo-file');
  const searchInput = document.getElementById('search');

  const field = (name) => form.elements.namedItem(name);

  // ---------- drobne narzędzia ----------

  // Tworzy element HTML lub SVG; teksty idą przez textContent (bez innerHTML)
  function h(tag, attrs = {}, ...children) {
    const node = SVG_TAGS.has(tag)
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return node;
  }

  // Hasło trzymamy tylko w sessionStorage (do zamknięcia karty)
  const getPassword = () => {
    try {
      return sessionStorage.getItem('haslo');
    } catch {
      return null;
    }
  };

  function applyEditMode() {
    document.body.classList.toggle('readonly', !getPassword());
    const btn = document.getElementById('edit-toggle');
    btn.textContent = getPassword() ? 'Zablokuj edycję' : 'Odblokuj edycję';
    btn.classList.toggle('active', Boolean(getPassword()));
  }

  async function api(method, url, body) {
    // Wersja statyczna (GitHub Pages): dane odszyfrowane w przeglądarce, bez zapisów
    if (window.DRZEWO_DATA) {
      if (method === 'GET' && url === '/api/tree') return window.DRZEWO_DATA;
      throw new Error('Ta wersja służy tylko do oglądania.');
    }
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    const haslo = getPassword();
    if (method !== 'GET' && haslo) headers['X-Haslo'] = haslo;
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Błąd ${res.status}`);
    return data;
  }

  const attempt = (fn) => async () => {
    try {
      await fn();
    } catch (err) {
      alert(err.message);
    }
  };

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  }

  function splitName(name) {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) return { first: '', last: words[0] };
    const last = words.pop();
    return { first: words.join(' '), last };
  }

  const truncate = (s, n = 15) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

  function cardDates(p) {
    const by = p.birth?.slice(0, 4);
    const dy = p.death?.slice(0, 4);
    if (by && dy) return `${by} – ${dy}`;
    if (by) return `ur. ${by}`;
    if (dy) return `zm. ${dy}`;
    return '';
  }

  const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

  // "2024-03-05" -> "05.03.2024", "2024" -> "2024", "2024-03" -> "03.2024"
  function formatDate(value) {
    return value.split('-').reverse().join('.');
  }

  // Wiek jest przybliżony, gdy któraś z dat ma tylko rok
  function ageOf(birth, death) {
    const end = death || new Date().toLocaleDateString('sv-SE');
    let age = Number(end.slice(0, 4)) - Number(birth.slice(0, 4));
    if (end.length === 10 && birth.length === 10 && end.slice(5) < birth.slice(5)) age -= 1;
    return age;
  }

  function datesLine(p) {
    const parts = [];
    if (p.birth) parts.push(`ur. ${formatDate(p.birth)}`);
    if (p.death) parts.push(`zm. ${formatDate(p.death)}`);
    if (p.birth) {
      const approx = p.birth.length < 10 || (p.death && p.death.length < 10) ? 'ok. ' : '';
      parts.push(`wiek: ${approx}${ageOf(p.birth, p.death)} lat`);
    }
    return parts.join(' · ');
  }

  // Czy data a jest wcześniejsza niż b (przy niepełnych datach porównuje lata)
  function isBefore(a, b) {
    if (a.slice(0, 4) !== b.slice(0, 4)) return a.slice(0, 4) < b.slice(0, 4);
    return a.length === 10 && b.length === 10 && a < b;
  }

  // Zmniejsza zdjęcie do max 256 px i zwraca JPEG jako data URL
  function resizeImage(file, maxSide) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvasEl = document.createElement('canvas');
        canvasEl.width = Math.round(img.width * scale);
        canvasEl.height = Math.round(img.height * scale);
        const ctx = canvasEl.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
        URL.revokeObjectURL(url);
        resolve(canvasEl.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Nie udało się wczytać zdjęcia.'));
      };
      img.src = url;
    });
  }

  // ---------- dane i relacje ----------

  async function load() {
    const data = await api('GET', '/api/tree');
    state.people = new Map(data.people.map((p) => [p.id, p]));
    state.relations = data.relations;
    if (state.selectedId !== null && !state.people.has(state.selectedId)) state.selectedId = null;
    redrawEdges();
    redrawCards();
    renderPanel();
  }

  // Powiązania osoby z podziałem na role (rodzeństwo wyliczane też ze wspólnych rodziców)
  function relationsOf(id) {
    const parents = [];
    const children = [];
    const spouses = [];
    const siblings = [];
    const seen = new Set([id]);

    for (const r of state.relations) {
      if (r.kind === 'parent') {
        if (r.b_id === id) parents.push({ rel: r, person: state.people.get(r.a_id) });
        else if (r.a_id === id) children.push({ rel: r, person: state.people.get(r.b_id) });
      } else if (r.kind === 'spouse' && (r.a_id === id || r.b_id === id)) {
        spouses.push({ rel: r, person: state.people.get(r.a_id === id ? r.b_id : r.a_id) });
      } else if (r.kind === 'sibling' && (r.a_id === id || r.b_id === id)) {
        const otherId = r.a_id === id ? r.b_id : r.a_id;
        siblings.push({ rel: r, person: state.people.get(otherId) });
        seen.add(otherId);
      }
    }

    for (const { person: parent } of parents) {
      for (const r of state.relations) {
        if (r.kind !== 'parent' || r.a_id !== parent.id || seen.has(r.b_id)) continue;
        seen.add(r.b_id);
        siblings.push({ rel: null, person: state.people.get(r.b_id) });
      }
    }

    const clean = (list) => list
      .filter((item) => item.person)
      .sort((a, b) => a.person.name.localeCompare(b.person.name, 'pl'));
    return {
      parents: clean(parents),
      children: clean(children),
      spouses: clean(spouses),
      siblings: clean(siblings),
    };
  }

  // ---------- układ nowych osób ----------

  // Pierwsze wolne miejsce w wierszu, zaczynając od (x, y)
  function freeSpot(x, y) {
    const step = CARD_W + COL_GAP;
    const occupied = [...state.people.values()];
    while (occupied.some((p) => Math.abs(p.x - x) < step && Math.abs(p.y - y) < CARD_H)) x += step;
    return { x: Math.round(x), y: Math.round(y) };
  }

  // Miejsce dla krewnego: dziecko pod rodzicem (między małżonkami), rodzic nad dzieckiem, reszta obok
  function spotFor(kind, anchorId) {
    const anchor = state.people.get(anchorId);
    let { x, y } = anchor;
    if (kind === 'child') {
      y += ROW_H;
      const rel = state.relations.find((r) => r.kind === 'spouse' && (r.a_id === anchorId || r.b_id === anchorId));
      const spouse = rel && state.people.get(rel.a_id === anchorId ? rel.b_id : rel.a_id);
      if (spouse) x = (x + spouse.x) / 2;
    } else if (kind === 'parent') {
      y -= ROW_H;
    } else {
      x += CARD_W + COL_GAP;
    }
    return freeSpot(x, y);
  }

  // Nowa osoba bez powiązań: pod resztą drzewa
  function bottomSpot() {
    const ys = [...state.people.values()].map((p) => p.y);
    return freeSpot(0, ys.length ? Math.max(...ys) + ROW_H : 0);
  }

  // ---------- automatyczne układanie ----------

  const SUBTREE_GAP = 60;

  // Pary są poziomymi jednostkami, dzieci leżą o wiersz niżej pod swoją jednostką rodziców,
  // a każda rodzina jest wyśrodkowana nad swoimi dziećmi.
  // Zwraca Map: id osoby -> { x, y }
  // Redukcja przecięć linii: w każdym wierszu jednostki są przestawiane metodą średnich
  // (przebiegi w dół i w górę), zostaje ułożenie z najmniejszą liczbą przecięć.
  // Potem każda jednostka jest centrowana między swoimi rodzicami i dziećmi.
  function refineLayout(units, seed, unitWidth, parentsOf, unitOf) {
    const byId = new Map(units.map((u) => [u.id, u]));
    const childrenOf = new Map(units.map((u) => [u.id, []]));
    for (const u of units) {
      for (const pid of u.parents) childrenOf.get(pid).push(u);
    }
    const maxDepth = Math.max(...units.map((u) => u.depth));

    let layers = Array.from({ length: maxDepth + 1 }, () => []);
    for (const u of units) layers[u.depth].push(u);

    const idx = new Map();
    const reindex = (d) => layers[d].forEach((u, i) => idx.set(u.id, i));
    const leftOf = (u) => Math.min(...u.members.map((m) => seed.get(m).x));
    for (let d = 0; d <= maxDepth; d += 1) {
      layers[d].sort((a, b) => leftOf(a) - leftOf(b));
      reindex(d);
    }

    const sortLayer = (d, neighbours) => {
      const keyed = layers[d].map((u) => {
        const ns = neighbours(u).map((n) => idx.get(n.id));
        const key = ns.length ? ns.reduce((s, v) => s + v, 0) / ns.length : idx.get(u.id);
        return [key, u];
      });
      keyed.sort((a, b) => a[0] - b[0]);
      layers[d] = keyed.map(([, u]) => u);
      reindex(d);
    };

    const parentsIn = (d) => (u) => u.parents.map((pid) => byId.get(pid)).filter((p) => p.depth === d - 1);
    const childrenIn = (d) => (u) => childrenOf.get(u.id).filter((c) => c.depth === d + 1);

    // Liczba przecięć między sąsiednimi wierszami (krawędzie rodzic -> dziecko)
    const crossings = () => {
      let total = 0;
      for (let d = 1; d <= maxDepth; d += 1) {
        const edges = [];
        layers[d].forEach((u, i) => {
          for (const pid of u.parents) {
            if (byId.get(pid).depth === d - 1) edges.push([idx.get(pid), i]);
          }
        });
        for (let i = 0; i < edges.length; i += 1) {
          for (let j = i + 1; j < edges.length; j += 1) {
            if ((edges[i][0] - edges[j][0]) * (edges[i][1] - edges[j][1]) < 0) total += 1;
          }
        }
      }
      return total;
    };

    const before = crossings();
    let bestCount = before;
    let best = layers.map((l) => [...l]);
    for (let it = 0; it < 12 && bestCount > 0; it += 1) {
      for (let d = 1; d <= maxDepth; d += 1) sortLayer(d, parentsIn(d));
      for (let d = maxDepth - 1; d >= 0; d -= 1) sortLayer(d, childrenIn(d));
      const c = crossings();
      if (c < bestCount) {
        bestCount = c;
        best = layers.map((l) => [...l]);
      }
    }
    layers = best;
    layers.forEach((_, d) => reindex(d));

    // Środki jednostek: startowo ciasno w kolejności wierszy, potem centrowanie między rodzinami i dziećmi
    const centers = new Map();
    for (const layer of layers) {
      let x = 0;
      for (const u of layer) {
        const w = unitWidth(u);
        centers.set(u.id, x + w / 2);
        x += w + SUBTREE_GAP;
      }
    }
    const avg = (list) => (list.length ? list.reduce((s, c) => s + c, 0) / list.length : null);
    const fromParents = (u) => avg(u.parents.map((pid) => centers.get(pid))) ?? centers.get(u.id);
    const fromChildren = (u) => avg(childrenOf.get(u.id).map((c) => centers.get(c.id))) ?? centers.get(u.id);
    const placeLayer = (layer, wantedCenter) => {
      let prevRight = -Infinity;
      for (const u of layer) {
        const w = unitWidth(u);
        const left = Math.max(wantedCenter(u) - w / 2, prevRight + SUBTREE_GAP);
        centers.set(u.id, left + w / 2);
        prevRight = left + w;
      }
    };
    for (let it = 0; it < 8; it += 1) {
      for (let d = 0; d <= maxDepth; d += 1) placeLayer(layers[d], fromParents);
      for (let d = maxDepth; d >= 0; d -= 1) placeLayer(layers[d], fromChildren);
    }

    // Małżonkowie: po lewej ta osoba, której rodzina (rodzice) jest bardziej po lewej
    for (const u of units) {
      if (u.members.length !== 2) continue;
      const sideOf = (m) => {
        const xs = (parentsOf.get(m) || [])
          .map((pid) => unitOf.get(pid))
          .filter((uid) => uid !== u.id)
          .map((uid) => centers.get(uid));
        return xs.length ? xs.reduce((s, c) => s + c, 0) / xs.length : null;
      };
      const sa = sideOf(u.members[0]);
      const sb = sideOf(u.members[1]);
      if (sa !== null && sb !== null && sa > sb) u.members.reverse();
    }

    // Przesunięcie całego układu tak, by zaczynał się od zera
    const minLeft = Math.min(...units.map((u) => centers.get(u.id) - unitWidth(u) / 2));
    const positions = new Map();
    for (const u of units) {
      let x = centers.get(u.id) - unitWidth(u) / 2 - minLeft;
      for (const m of u.members) {
        positions.set(m, { x: Math.round(x), y: u.depth * ROW_H });
        x += CARD_W + COL_GAP;
      }
    }
    console.info(`Przecięcia linii: ${before} -> ${bestCount}`);
    return positions;
  }

  function computeLayout() {

    const units = [];
    const unitOf = new Map();
    const newUnit = (members) => {
      const unit = { id: units.length, members, parent: null, parents: [], children: [], depth: 0 };
      units.push(unit);
      for (const m of members) unitOf.set(m, unit.id);
    };

    for (const r of state.relations) {
      if (r.kind !== 'spouse') continue;
      if (!state.people.has(r.a_id) || !state.people.has(r.b_id)) continue;
      if (unitOf.has(r.a_id) || unitOf.has(r.b_id)) continue;
      newUnit([r.a_id, r.b_id]);
    }
    for (const id of [...state.people.keys()].sort((a, b) => a - b)) {
      if (!unitOf.has(id)) newUnit([id]);
    }

    const parentsOf = new Map();
    for (const r of state.relations) {
      if (r.kind !== 'parent' || !state.people.has(r.a_id)) continue;
      if (!parentsOf.has(r.b_id)) parentsOf.set(r.b_id, []);
      parentsOf.get(r.b_id).push(r.a_id);
    }
    // Wszystkie rodziny jednostki (np. rodzina ojca i rodzina matki); pierwsza tworzy drzewo układu
    for (const unit of units) {
      const parentUnits = new Set();
      for (const m of unit.members) {
        for (const pid of parentsOf.get(m) || []) {
          const uid = unitOf.get(pid);
          if (uid !== unit.id) parentUnits.add(uid);
        }
      }
      unit.parents = [...parentUnits];
      unit.parent = unit.parents.length ? unit.parents[0] : null;
    }

    // Pierwsza rodzina jednostki to ta z największą liczbą dzieci (rodzeństwo trzyma się razem)
    const childCount = new Map();
    for (const unit of units) {
      for (const pu of unit.parents) childCount.set(pu, (childCount.get(pu) || 0) + 1);
    }
    for (const unit of units) {
      if (unit.parents.length) {
        unit.parent = unit.parents.reduce((best, pu) => (childCount.get(pu) > childCount.get(best) ? pu : best), unit.parents[0]);
      }
    }

    const birthOf = (unit) => state.people.get(unit.members[0]).birth || '9999';
    for (const unit of units) {
      if (unit.parent !== null) units[unit.parent].children.push(unit.id);
    }
    for (const unit of units) {
      unit.children.sort((a, b) => birthOf(units[a]).localeCompare(birthOf(units[b])) || a - b);
    }

    // Odwiedzanie od korzeni; jednostki w cyklach (dziwne dane) dostają własny korzeń
    const visited = new Set();
    const visit = (unit, depth) => {
      if (visited.has(unit.id)) return;
      visited.add(unit.id);
      unit.depth = depth;
      for (const cid of unit.children) visit(units[cid], depth + 1);
    };
    for (const unit of units) if (unit.parent === null) visit(unit, 0);
    for (const unit of units) {
      if (visited.has(unit.id)) continue;
      if (unit.parent !== null) {
        units[unit.parent].children = units[unit.parent].children.filter((cid) => cid !== unit.id);
        unit.parent = null;
      }
      unit.parents = [];
      visit(unit, 0);
    }

    // Wiersz = najdłuższa ścieżka po wszystkich rodzinach (para leży pod obiema rodzinami),
    // a rodzeństwo (dzieci tej samej rodziny) ląduje w jednym wierszu
    const settleDepths = () => {
      for (let pass = 0; pass < units.length; pass += 1) {
        let changed = false;
        for (const unit of units) {
          for (const pid of unit.parents) {
            if (units[pid].depth + 1 > unit.depth) {
              unit.depth = units[pid].depth + 1;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }
    };
    for (let round = 0; round < units.length; round += 1) {
      settleDepths();
      const groupDepth = new Map();
      for (const unit of units) {
        for (const pu of unit.parents) {
          groupDepth.set(pu, Math.max(groupDepth.get(pu) ?? 0, unit.depth));
        }
      }
      let changed = false;
      for (const unit of units) {
        for (const pu of unit.parents) {
          if (unit.depth < groupDepth.get(pu)) {
            unit.depth = groupDepth.get(pu);
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    const unitWidth = (unit) => (unit.members.length === 2 ? 2 * CARD_W + COL_GAP : CARD_W);
    // Wiersz po wierszu, od góry. Jednostka staje nad środkiem swoich rodzin
    // (para z dwiema rodzinami - między nimi), a rodzeństwo ląduje obok siebie.
    const positions = new Map();
    const center = new Map();
    const rows = new Map();
    for (const unit of units) {
      if (!rows.has(unit.depth)) rows.set(unit.depth, []);
      rows.get(unit.depth).push(unit);
    }

    const desiredCenter = (unit) => {
      const known = unit.parents.filter((pid) => center.has(pid)).map((pid) => center.get(pid));
      return known.length ? known.reduce((sum, c) => sum + c, 0) / known.length : Infinity;
    };

    for (const depth of [...rows.keys()].sort((a, b) => a - b)) {
      const row = rows.get(depth);
      // Najpierw grupy rodzin (wg środka głównej rodziny), w grupie - wg środka rodzin
      const groupOf = (unit) => (unit.parent !== null && center.has(unit.parent) ? center.get(unit.parent) : Infinity);
      row.sort((a, b) => {
        const ga = groupOf(a);
        const gb = groupOf(b);
        if (ga !== gb) return ga < gb ? -1 : 1;
        const da = desiredCenter(a);
        const db = desiredCenter(b);
        if (da === db) return a.id - b.id;
        return da < db ? -1 : 1;
      });

      let prevRight = -SUBTREE_GAP;
      for (const unit of row) {
        const w = unitWidth(unit);
        const d = desiredCenter(unit);
        const wanted = Number.isFinite(d) ? d - w / 2 : prevRight + SUBTREE_GAP;
        const left = Math.max(wanted, prevRight + SUBTREE_GAP);
        let x = left;
        for (const m of unit.members) {
          positions.set(m, { x: Math.round(x), y: depth * ROW_H });
          x += CARD_W + COL_GAP;
        }
        center.set(unit.id, left + w / 2);
        prevRight = left + w;
      }
    }
    return refineLayout(units, positions, unitWidth, parentsOf, unitOf);
  }

  async function arrangeTree() {
    if (!state.people.size) return;
    const positions = computeLayout();
    const list = [];
    for (const [id, pos] of positions) {
      const p = state.people.get(id);
      p.x = pos.x;
      p.y = pos.y;
      list.push({ id, x: pos.x, y: pos.y });
    }
    await api('POST', '/api/positions', { positions: list });
    redrawEdges();
    redrawCards();
    fitView();
  }

  // ---------- rysowanie ----------

  // Punkt „serca” między małżonkami: z niego wychodzą linie do dzieci
  function heartPoint(a, b) {
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    const gap = right.x - (left.x + CARD_W);
    if (a.y === b.y && gap <= COL_GAP + 1) {
      return { x: left.x + CARD_W + gap / 2, y: left.y + CARD_H / 2 };
    }
    const x1 = a.x + CARD_W / 2;
    const x2 = b.x + CARD_W / 2;
    const y1 = a.y + CARD_H;
    const y2 = b.y + CARD_H;
    const ctrlY = Math.max(a.y, b.y) + CARD_H + 70;
    return { x: (x1 + x2) / 2, y: 0.25 * y1 + 0.5 * ctrlY + 0.25 * y2 };
  }

  // Linie rodzic -> dziecko; gdy rodzice są parą, linia startuje z serca
  function parentEdgeNodes() {
    const sel = state.selectedId;
    const kin = state.highlightAll && sel !== null ? lineageOf(sel) : null;
    const parentsOf = new Map();
    const couples = new Set();
    const pairKey = (x, y) => (x < y ? `${x}-${y}` : `${y}-${x}`);
    for (const r of state.relations) {
      if (r.kind === 'spouse') couples.add(pairKey(r.a_id, r.b_id));
      if (r.kind !== 'parent') continue;
      if (!parentsOf.has(r.b_id)) parentsOf.set(r.b_id, []);
      parentsOf.get(r.b_id).push(r.a_id);
    }

    // Każda rodzina w danym wierszu dostaje własną wysokość poziomej linii (od lewej do prawej),
    // żeby linie różnych rodzin nie zlewały się w jedną
    const LANE_GAP = 12;
    const slots = new Map();
    for (const [childId, parentIds] of parentsOf) {
      const child = state.people.get(childId);
      if (!child) continue;
      for (const pid of parentIds) {
        const parent = state.people.get(pid);
        if (!parent) continue;
        const partnerId = parentIds.find((q) => q !== pid && couples.has(pairKey(pid, q)));
        const key = partnerId === undefined ? pid : Math.min(pid, partnerId);
        const x = partnerId === undefined ? parent.x : heartPoint(parent, state.people.get(partnerId)).x;
        if (!slots.has(child.y)) slots.set(child.y, new Map());
        slots.get(child.y).set(key, x);
      }
    }
    const laneOf = new Map();
    const colorOf = new Map();
    for (const [rowY, keys] of slots) {
      const ordered = [...keys.entries()].sort((a, b) => a[1] - b[1]);
      ordered.forEach(([key], i) => {
        laneOf.set(`${rowY}:${key}`, (i - (ordered.length - 1) / 2) * LANE_GAP);
        if (ordered.length > 1) colorOf.set(`${rowY}:${key}`, i);
      });
    }

    const nodes = [];
    for (const [childId, parentIds] of parentsOf) {
      const child = state.people.get(childId);
      if (!child) continue;
      const cx = child.x + CARD_W / 2;
      const drawnCouples = new Set();
      for (const pid of parentIds) {
        const parent = state.people.get(pid);
        if (!parent) continue;
        const partnerId = parentIds.find((q) => q !== pid && couples.has(pairKey(pid, q)));
        let origin = { x: parent.x + CARD_W / 2, y: parent.y + CARD_H };
        if (partnerId !== undefined) {
          const key = pairKey(pid, partnerId);
          if (drawnCouples.has(key)) continue;
          drawnCouples.add(key);
          origin = heartPoint(parent, state.people.get(partnerId));
        }
        // Linia schodzi w dół do przerwy między wierszami, biegnie w bok i opada do dziecka.
        // Dzięki temu poziome odcinki nigdy nie przecinają kart.
        // Każda para ma własną wysokość poziomej linii, żeby linie różnych rodzin się nie zlewały
        const coupleKey = partnerId === undefined ? pid : Math.min(pid, partnerId);
        const busY = child.y - ROW_GAP / 2 + laneOf.get(`${child.y}:${coupleKey}`);
        const hot = kin
          ? kin.has(childId) && kin.has(pid)
          : sel !== null && (childId === sel || pid === sel || partnerId === sel);
        const colorIdx = colorOf.get(`${child.y}:${coupleKey}`);
        const color = !hot && colorIdx !== undefined ? LINE_COLORS[colorIdx % LINE_COLORS.length] : null;
        nodes.push(h('path', {
          class: `edge parent${hot ? ' hl' : sel !== null ? ' dim' : ''}`,
          d: `M${origin.x},${origin.y} V${busY} H${cx} V${child.y}`,
          style: color ? `stroke: ${color}` : null,
          'marker-end': 'url(#arrow)',
        }));
      }
    }
    return nodes;
  }

  // Małżeństwo (linia z sercem) i rodzeństwo (łuk)
  function otherEdgeNodes(r, a, b) {
    if (r.kind === 'spouse') {
      const [left, right] = a.x < b.x ? [a, b] : [b, a];
      const gap = right.x - (left.x + CARD_W);
      if (a.y === b.y && gap <= COL_GAP + 1) {
        const y = left.y + CARD_H / 2;
        const midX = left.x + CARD_W + gap / 2;
        return [h('g', { class: 'edge spouse' },
          h('line', { x1: left.x + CARD_W, y1: y, x2: right.x, y2: y }),
          h('text', { x: midX, y: y + 6, text: '♥' }))];
      }
      const x1 = a.x + CARD_W / 2;
      const x2 = b.x + CARD_W / 2;
      const ctrlY = Math.max(a.y, b.y) + CARD_H + 70;
      return [h('path', { class: 'edge spouse', d: `M${x1},${a.y + CARD_H} Q${(x1 + x2) / 2},${ctrlY} ${x2},${b.y + CARD_H}` })];
    }

    // sibling: łuk nad kartami
    const x1 = a.x + CARD_W / 2;
    const x2 = b.x + CARD_W / 2;
    const ctrlY = Math.min(a.y, b.y) - 50;
    return [h('path', { class: 'edge sibling', d: `M${x1},${a.y} Q${(x1 + x2) / 2},${ctrlY} ${x2},${b.y}` })];
  }

  function redrawEdges() {
    const nodes = parentEdgeNodes();
    for (const r of state.relations) {
      if (r.kind === 'parent') continue;
      const a = state.people.get(r.a_id);
      const b = state.people.get(r.b_id);
      if (a && b) nodes.push(...otherEdgeNodes(r, a, b));
    }
    edgesLayer.replaceChildren(...nodes);
  }

  function cardNode(p, kin = null) {
    const classes = ['card', p.gender === 'K' ? 'f' : p.gender === 'M' ? 'm' : 'n'];
    if (kin) classes.push(kin.has(p.id) ? 'kin' : 'dim');
    if (p.id === state.selectedId) classes.push('selected');
    if (state.search && p.name.toLowerCase().includes(state.search)) classes.push('match');

    const clipId = `clip-${p.id}`;
    const { first, last } = splitName(p.name);
    const dates = cardDates(p);
    const tooltip = dates ? `${p.name} (${dates})` : p.name;

    return h('g', { class: classes.join(' '), transform: `translate(${p.x},${p.y})`, 'data-id': p.id },
      h('title', { text: tooltip }),
      h('rect', { class: 'bg', width: CARD_W, height: CARD_H, rx: 14 }),
      h('clipPath', { id: clipId }, h('circle', { cx: 46, cy: CARD_H / 2, r: 30 })),
      p.photo
        ? h('image', {
          href: p.photo,
          x: 16,
          y: CARD_H / 2 - 30,
          width: 60,
          height: 60,
          preserveAspectRatio: 'xMidYMid slice',
          'clip-path': `url(#${clipId})`,
        })
        : h('g', {},
          h('circle', { class: 'avatar', cx: 46, cy: CARD_H / 2, r: 30 }),
          h('text', { class: 'initials', x: 46, y: CARD_H / 2, 'text-anchor': 'middle', text: initials(p.name) })),
      h('text', { class: 'name', x: 88, y: 38, text: truncate(first || last) }),
      h('text', { class: 'name', x: 88, y: 56, text: first ? truncate(last) : '' }),
      h('text', { class: 'dates', x: 88, y: 76, text: dates }),
    );
  }

  function redrawCards() {
    const kin = state.highlightAll && state.selectedId !== null ? lineageOf(state.selectedId) : null;
    cardsLayer.replaceChildren(...[...state.people.values()].map((p) => cardNode(p, kin)));
  }

  function applyView() {
    const v = state.view;
    world.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.k})`);
  }

  function fitView() {
    const rect = canvas.getBoundingClientRect();
    const list = [...state.people.values()];
    if (!list.length) {
      state.view = { x: rect.width / 2, y: rect.height / 2, k: 1 };
      applyView();
      return;
    }
    const minX = Math.min(...list.map((p) => p.x));
    const maxX = Math.max(...list.map((p) => p.x + CARD_W));
    const minY = Math.min(...list.map((p) => p.y));
    const maxY = Math.max(...list.map((p) => p.y + CARD_H));
    const pad = 60;
    const k = clamp(
      Math.min((rect.width - pad * 2) / (maxX - minX), (rect.height - pad * 2) / (maxY - minY)),
      MIN_K,
      1.2,
    );
    state.view = {
      k,
      x: rect.width / 2 - ((minX + maxX) / 2) * k,
      y: rect.height / 2 - ((minY + maxY) / 2) * k,
    };
    applyView();
  }

  function centerOn(id) {
    const p = state.people.get(id);
    if (!p) return;
    const rect = canvas.getBoundingClientRect();
    const usableWidth = rect.width - (panel.hidden ? 0 : PANEL_W);
    const v = state.view;
    v.x = usableWidth / 2 - (p.x + CARD_W / 2) * v.k;
    v.y = rect.height / 2 - (p.y + CARD_H / 2) * v.k;
    applyView();
  }

  // ---------- panel ----------

  function select(id) {
    state.selectedId = id;
    redrawEdges();
    redrawCards();
    renderPanel();
  }

  function relationSection(title, role, items) {
    if (!items.length) return null;
    return h('section', { class: 'relations' },
      h('h3', { text: title }),
      h('ul', {}, ...items.map(({ rel, person }) => h('li', {},
        h('button', {
          class: 'link',
          text: `${ROLE_NAMES[role][person.gender ?? '']}: ${person.name}`,
          onclick: () => {
            select(person.id);
            centerOn(person.id);
          },
        }),
        rel ? h('button', {
          class: 'icon edit-only',
          title: 'Usuń powiązanie',
          text: '✕',
          onclick: attempt(() => deleteRelation(rel)),
        }) : null,
      ))),
    );
  }

  // Przodkowie i potomkowie osoby (cała linia prosta: rodzice, dziadkowie, dzieci, wnuki itd.)
  function lineageOf(id) {
    const parents = new Map();
    const children = new Map();
    for (const r of state.relations) {
      if (r.kind !== 'parent') continue;
      if (!children.has(r.a_id)) children.set(r.a_id, []);
      children.get(r.a_id).push(r.b_id);
      if (!parents.has(r.b_id)) parents.set(r.b_id, []);
      parents.get(r.b_id).push(r.a_id);
    }
    const walk = (edges) => {
      const seen = new Set([id]);
      const queue = [id];
      for (let i = 0; i < queue.length; i += 1) {
        for (const n of edges.get(queue[i]) || []) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      return seen;
    };
    return new Set([...walk(parents), ...walk(children)]);
  }

  // Formularz w panelu: dopisuje powiązanie do już istniejącej osoby
  function linkForm(p) {
    const others = [...state.people.values()]
      .filter((q) => q.id !== p.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    const personSelect = h('select', {},
      h('option', { value: '', text: '— wybierz osobę —' }),
      ...others.map((q) => h('option', { value: q.id, text: q.name })));
    const kindSelect = h('select', {},
      h('option', { value: 'parent', text: 'jest rodzicem tej osoby' }),
      h('option', { value: 'child', text: 'jest dzieckiem tej osoby' }),
      h('option', { value: 'spouse', text: 'jest małżonkiem tej osoby' }),
      h('option', { value: 'sibling', text: 'jest rodzeństwem tej osoby' }));
    return h('section', { class: 'relations link-form edit-only' },
      h('h3', { text: 'Dodaj powiązanie' }),
      personSelect,
      kindSelect,
      h('button', {
        class: 'primary',
        text: 'Dodaj powiązanie',
        onclick: attempt(async () => {
          const other = Number(personSelect.value);
          if (!other) throw new Error('Wybierz osobę.');
          const kind = kindSelect.value;
          const body = kind === 'parent'
            ? { a: other, b: p.id, kind: 'parent' }
            : kind === 'child'
              ? { a: p.id, b: other, kind: 'parent' }
              : { a: p.id, b: other, kind };
          await api('POST', '/api/relations', body);
          await load();
          select(p.id);
        }),
      }),
    );
  }

  function renderPanel() {
    const p = state.people.get(state.selectedId);
    panel.hidden = !p;
    if (!p) return;

    const rel = relationsOf(p.id);
    panel.replaceChildren(
      h('button', { class: 'icon close', title: 'Zamknij', text: '✕', onclick: () => select(null) }),
      h('div', { class: 'panel-photo' },
        p.photo
          ? h('img', { src: p.photo, alt: p.name })
          : h('div', { class: 'avatar-large', text: initials(p.name) })),
      h('h2', { text: p.name }),
      h('p', { class: 'dates', text: datesLine(p) }),
      p.description
        ? h('p', { class: 'description', text: p.description })
        : h('p', { class: 'muted', text: 'Brak opisu.' }),
      ...[
        relationSection('Rodzice', 'parent', rel.parents),
        relationSection('Małżonek / małżonka', 'spouse', rel.spouses),
        relationSection('Dzieci', 'child', rel.children),
        relationSection('Rodzeństwo', 'sibling', rel.siblings),
      ].filter(Boolean),
      linkForm(p),
      h('div', { class: 'panel-actions edit-only' },
        h('button', { class: 'primary', text: '+ Dodaj krewnego', onclick: () => openDialog({ anchorId: p.id }) }),
        h('button', { text: 'Edytuj', onclick: () => openDialog({ person: p }) }),
        h('button', { class: 'danger', text: 'Usuń osobę', onclick: attempt(() => deletePerson(p)) }),
      ),
    );
  }

  async function deleteRelation(rel) {
    if (!confirm('Usunąć to powiązanie?')) return;
    await api('DELETE', `/api/relations/${rel.id}`);
    await load();
  }

  async function deletePerson(p) {
    if (!confirm(`Usunąć osobę „${p.name}” wraz z jej powiązaniami?`)) return;
    await api('DELETE', `/api/people/${p.id}`);
    state.selectedId = null;
    await load();
  }

  // ---------- formularz ----------

  let editingId = null;
  let photoState; // undefined = bez zmian, null = usuń, string = nowe zdjęcie

  function setPhotoPreview(src) {
    photoPreview.src = src || '';
    photoPreview.hidden = !src;
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  function onRelationChange() {
    const rel = RELATIONS[field('relation').value];
    field('gender').disabled = Boolean(rel);
    if (rel) field('gender').value = rel.gender;
  }

  function openDialog({ person = null, anchorId = null } = {}) {
    editingId = person ? person.id : null;
    photoState = person ? undefined : null;
    form.reset();
    field('name').value = person?.name ?? '';
    field('birth').value = person?.birth ?? '';
    field('death').value = person?.death ?? '';
    field('gender').value = person?.gender ?? '';
    field('description').value = person?.description ?? '';

    const anchorSelect = field('anchor');
    const sorted = [...state.people.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'));
    anchorSelect.replaceChildren(
      h('option', { value: '', text: '— wybierz osobę —' }),
      ...sorted.map((p) => h('option', { value: p.id, text: p.name })),
    );
    anchorSelect.value = anchorId ?? '';

    relationFields.hidden = Boolean(person);
    dialogTitle.textContent = person ? 'Edytuj osobę' : 'Nowa osoba';
    setPhotoPreview(person?.photo ?? null);
    formError.hidden = true;
    onRelationChange();
    dialog.showModal();
    field('name').focus();
  }

  async function saveForm(event) {
    event.preventDefault();
    const data = {
      name: field('name').value.trim(),
      birth: field('birth').value || null,
      death: field('death').value || null,
      gender: field('gender').value || null,
      description: field('description').value.trim(),
    };
    if (photoState !== undefined) data.photo = photoState;

    if (!data.name) return showFormError('Podaj imię i nazwisko.');
    if ((data.birth && !DATE_RE.test(data.birth)) || (data.death && !DATE_RE.test(data.death))) {
      return showFormError('Daty wpisz jako RRRR, RRRR-MM lub RRRR-MM-DD.');
    }
    if (data.birth && data.death && isBefore(data.death, data.birth)) {
      return showFormError('Data zgonu jest wcześniejsza niż data urodzenia.');
    }

    try {
      if (editingId !== null) {
        await api('PUT', `/api/people/${editingId}`, data);
        dialog.close();
        await load();
        select(editingId);
        return;
      }

      const relKey = field('relation').value;
      const anchorId = Number(field('anchor').value) || null;
      if (relKey && !anchorId) return showFormError('Wybierz osobę, względem której dodajesz krewnego.');

      const spot = relKey ? spotFor(RELATIONS[relKey].kind, anchorId) : bottomSpot();
      const { id } = await api('POST', '/api/people', {
        ...data,
        ...spot,
        relative: relKey ? { label: relKey, anchorId } : null,
      });
      dialog.close();
      await load();
      select(id);
      centerOn(id);
    } catch (err) {
      showFormError(err.message);
    }
  }

  // ---------- interakcje: pan, zoom, przeciąganie kart ----------

  let gesture = null;

  canvas.addEventListener('pointerdown', (e) => {
    const cardEl = e.target.closest('.card');
    if (cardEl) {
      const p = state.people.get(Number(cardEl.dataset.id));
      gesture = { type: 'card', p, el: cardEl, startX: e.clientX, startY: e.clientY, origX: p.x, origY: p.y, moved: false };
    } else {
      gesture = { type: 'pan', startX: e.clientX, startY: e.clientY, origX: state.view.x, origY: state.view.y, moved: false };
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!gesture) return;
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
    if (gesture.type === 'card' && !getPassword()) return;
    if (!gesture.moved) canvas.classList.add('grabbing');
    gesture.moved = true;

    if (gesture.type === 'pan') {
      state.view.x = gesture.origX + dx;
      state.view.y = gesture.origY + dy;
      applyView();
      return;
    }
    const p = gesture.p;
    p.x = Math.round(gesture.origX + dx / state.view.k);
    p.y = Math.round(gesture.origY + dy / state.view.k);
    gesture.el.setAttribute('transform', `translate(${p.x},${p.y})`);
    redrawEdges();
  });

  function endGesture(e) {
    if (!gesture) return;
    const g = gesture;
    gesture = null;
    canvas.classList.remove('grabbing');
    if (g.type === 'card') {
      if (g.moved) {
        api('PUT', `/api/people/${g.p.id}`, { x: g.p.x, y: g.p.y }).catch((err) => alert(err.message));
      } else {
        select(g.p.id);
      }
    } else if (!g.moved) {
      select(null);
    }
    if (e) e.preventDefault();
  }

  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const v = state.view;
    const k = clamp(v.k * Math.exp(-e.deltaY * 0.0015), MIN_K, MAX_K);
    const wx = (sx - v.x) / v.k;
    const wy = (sy - v.y) / v.k;
    v.k = k;
    v.x = sx - wx * k;
    v.y = sy - wy * k;
    applyView();
  }, { passive: false });

  // ---------- zdarzenia interfejsu ----------

  document.getElementById('add-person').addEventListener('click', () => openDialog());
  document.getElementById('fit').addEventListener('click', fitView);
  document.getElementById('edit-toggle').addEventListener('click', async () => {
    if (getPassword()) {
      sessionStorage.removeItem('haslo');
      applyEditMode();
      return;
    }
    const haslo = prompt('Hasło do edycji:');
    if (haslo === null) return;
    try {
      await api('POST', '/api/auth', { haslo });
      sessionStorage.setItem('haslo', haslo);
      applyEditMode();
    } catch (err) {
      alert(err.message);
    }
  });
  const kinToggle = document.getElementById('kin-toggle');
  kinToggle.addEventListener('click', () => {
    state.highlightAll = !state.highlightAll;
    kinToggle.setAttribute('aria-pressed', String(state.highlightAll));
    kinToggle.classList.toggle('active', state.highlightAll);
    redrawEdges();
    redrawCards();
  });
  document.getElementById('arrange').addEventListener('click', attempt(arrangeTree));
  document.getElementById('cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', saveForm);
  field('relation').addEventListener('change', onRelationChange);

  photoFile.addEventListener('change', async () => {
    const file = photoFile.files[0];
    if (!file) return;
    try {
      photoState = await resizeImage(file, 256);
      setPhotoPreview(photoState);
    } catch (err) {
      showFormError(err.message);
    }
  });

  document.getElementById('photo-remove').addEventListener('click', () => {
    photoState = null;
    photoFile.value = '';
    setPhotoPreview(null);
  });

  searchInput.addEventListener('input', () => {
    state.search = searchInput.value.trim().toLowerCase();
    redrawCards();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !state.search) return;
    const match = [...state.people.values()].find((p) => p.name.toLowerCase().includes(state.search));
    if (match) {
      select(match.id);
      centerOn(match.id);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dialog.open) select(null);
  });


  // ---------- start ----------

  // Pierwsze dopasowanie dopiero, gdy płótno ma realny rozmiar
  let fitted = false;
  new ResizeObserver(() => {
    const rect = canvas.getBoundingClientRect();
    if (fitted || rect.width === 0 || rect.height === 0) return;
    fitted = true;
    fitView();
  }).observe(canvas);

  applyView();
  applyEditMode();
  load().catch((err) => alert(`Nie udało się wczytać drzewa: ${err.message}`));
})();
