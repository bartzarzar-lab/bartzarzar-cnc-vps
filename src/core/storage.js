// Zapis projektów, ustawień i własnych materiałów/narzędzi — localStorage
// (na Androidzie w Capacitorze też działa; małe dane, brak potrzeby IndexedDB).

const KEY = 'cncvps.v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
function save(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('storage', e);
  }
}

export const storage = {
  get(k, def) {
    const db = load();
    return k in db ? db[k] : def;
  },
  set(k, v) {
    const db = load();
    db[k] = v;
    save(db);
  },
  listProjects() {
    return storage.get('projects', []);
  },
  saveProject(p) {
    const list = storage.listProjects().filter((x) => x.id !== p.id);
    p.updated = Date.now();
    list.unshift(p);
    storage.set('projects', list.slice(0, 100));
  },
  deleteProject(id) {
    storage.set('projects', storage.listProjects().filter((x) => x.id !== id));
  },
  exportAll() {
    return JSON.stringify(load(), null, 2);
  },
  importAll(json) {
    const obj = JSON.parse(json);
    save({ ...load(), ...obj });
  }
};

export const uid = () => Math.random().toString(36).slice(2, 10);
