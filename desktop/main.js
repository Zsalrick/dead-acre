// Dead Acre desktop: the same game from GitHub Pages, in its own window, no browser shortcuts.
// Saves live in sealed files per profile (AES-GCM: unreadable, and any edit is caught), not in the browser.
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const ORIGIN = 'https://zsalrick.github.io', GAME = ORIGIN + '/dead-acre/';
if (process.env.DA_USERDATA) app.setPath('userData', process.env.DA_USERDATA); // tests run in a scratch folder
Menu.setApplicationMenu(null); // no menu, no accelerators: Ctrl+W, Ctrl+R, F5, Ctrl+Shift+I do nothing

// ---------- sealed save files ----------
const KEY = crypto.createHash('sha256').update(['dead', 'acre', 'f7c2', 'save', '9b41e0', 'v1'].join('/')).digest();
function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.concat([Buffer.from('DA1'), iv, c.getAuthTag(), body]);
}
function unseal(buf) {
  if (buf.subarray(0, 3).toString() !== 'DA1') throw new Error('not a Dead Acre save');
  const c = crypto.createDecipheriv('aes-256-gcm', KEY, buf.subarray(3, 15)); c.setAuthTag(buf.subarray(15, 31));
  return JSON.parse(Buffer.concat([c.update(buf.subarray(31)), c.final()]).toString('utf8')); // a changed byte fails the tag
}
const root = () => path.join(app.getPath('userData'), 'profiles');
const saveFile = p => path.join(root(), p, 'save.dat');
const cleanName = s => String(s || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
function listProfiles() {
  try { return fs.readdirSync(root(), { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(saveFile(d.name))).map(d => d.name).sort(); } catch (e) { return []; }
}
function readProfile(p) { // the file; if it was edited or broken, the newest good copy that has characters in it
  const f = saveFile(p), ok = x => { try { return unseal(fs.readFileSync(x)); } catch (e) { return null; } };
  const main = ok(f); if (main) return { data: main, fromBackup: false, tampered: false };
  const bk = path.join(root(), p, 'backups'), cands = [f + '.bak', ...(fs.existsSync(bk) ? fs.readdirSync(bk).sort().reverse().map(n => path.join(bk, n)) : [])];
  const good = cands.map(ok).filter(Boolean), pick = good.find(d => chars(d)) || good[0];
  return { data: pick || {}, fromBackup: !!pick, tampered: fs.existsSync(f) };
}
function writeProfile(p, data) { // write aside, read it back, then swap in; the old one becomes the .bak
  const f = saveFile(p), tmp = f + '.tmp', buf = seal(data);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(tmp, buf);
  if (JSON.stringify(unseal(fs.readFileSync(tmp))) !== JSON.stringify(data)) throw new Error('verify failed');
  try { unseal(fs.readFileSync(f)); fs.copyFileSync(f, f + '.bak'); } catch (e) {} // only a good file becomes the backup
  fs.renameSync(tmp, f);
  const day = new Date().toISOString().slice(0, 10), bk = path.join(root(), p, 'backups'); // one copy a day, the last 7 kept
  fs.mkdirSync(bk, { recursive: true }); fs.copyFileSync(f, path.join(bk, `save-${day}.dat`)); // the day's latest
  fs.readdirSync(bk).sort().slice(0, -7).forEach(n => fs.rmSync(path.join(bk, n), { force: true }));
}
const chars = data => Object.keys(data).filter(k => /^deadacre\.career\.\d+$/.test(k)).length;

// ---------- taking the saves over from the browsers (read from a copy, the browser's own files are never touched) ----------
const LOCAL = process.env.LOCALAPPDATA || '', ROAM = process.env.APPDATA || '';
const BROWSERS = [['brave', path.join(LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data')], ['chrome', path.join(LOCAL, 'Google', 'Chrome', 'User Data')],
  ['edge', path.join(LOCAL, 'Microsoft', 'Edge', 'User Data')], ['opera', path.join(ROAM, 'Opera Software')]];
function browserSources() { // every browser profile whose storage mentions the game's site
  const out = [];
  for (const [b, dir] of BROWSERS) {
    let profs = []; try { profs = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch (e) { continue; }
    for (const pr of profs) {
      const ldb = path.join(dir, pr, 'Local Storage', 'leveldb'); if (!fs.existsSync(ldb)) continue;
      let hit = false; try { for (const n of fs.readdirSync(ldb)) { if (!/\.(ldb|log)$/.test(n)) continue; if (fs.readFileSync(path.join(ldb, n)).includes('zsalrick.github.io')) { hit = true; break; } } } catch (e) {}
      if (hit) out.push({ id: `${b}/${pr}`, name: cleanName(pr === 'Default' || pr === 'Opera Stable' ? b : `${b}-${pr}`), ldb });
    }
  }
  return out;
}
async function readBrowser(src) { // copy its storage into a scratch session and let Chromium itself read it
  const part = 'imp' + crypto.randomBytes(4).toString('hex'), pdir = path.join(app.getPath('userData'), 'Partitions', part), dst = path.join(pdir, 'Local Storage', 'leveldb');
  fs.mkdirSync(dst, { recursive: true });
  for (const n of fs.readdirSync(src.ldb)) if (n !== 'LOCK') try { fs.copyFileSync(path.join(src.ldb, n), path.join(dst, n)); } catch (e) {}
  const w = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:' + part, javascript: true } });
  try {
    await w.loadURL(ORIGIN + '/dead-acre/__import__').catch(() => {}); // any page of the site: only its storage matters
    return JSON.parse(await w.webContents.executeJavaScript('JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))'));
  } finally { w.destroy(); setTimeout(() => fs.rmSync(pdir, { recursive: true, force: true }), 1500); }
}
const importLog = () => path.join(app.getPath('userData'), 'imported.json');
async function importBrowsers(progress) {
  let done = {}; try { done = JSON.parse(fs.readFileSync(importLog(), 'utf8')); } catch (e) {}
  const todo = browserSources().filter(s => !done[s.id]), report = [];
  for (let i = 0; i < todo.length; i++) {
    const s = todo[i]; progress((i + .5) / todo.length, `Átvétel: ${s.name}`);
    try {
      const data = await readBrowser(s), n = chars(data);
      if (!n) { done[s.id] = { at: Date.now(), n: 0 }; continue; }
      let name = s.name; while (fs.existsSync(saveFile(name))) name = name + '-2'; // never over an app profile that already exists
      writeProfile(name, data);
      const back = readProfile(name).data, same = JSON.stringify(back) === JSON.stringify(data); // read back and compare before calling it done
      done[s.id] = { at: Date.now(), n, profile: name, ok: same };
      report.push({ profile: name, from: s.id, n, ok: same });
    } catch (e) { report.push({ profile: s.name, from: s.id, n: 0, ok: false, err: String(e.message || e) }); }
  }
  fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(importLog(), JSON.stringify(done, null, 1));
  return report;
}

// ---------- windows ----------
const games = new Map(); // webContents id -> { p, data, win }
let launcher = null;
function openLauncher() {
  launcher = new BrowserWindow({ width: 560, height: 620, resizable: false, title: 'Dead Acre', backgroundColor: '#0e0d0a', webPreferences: { preload: path.join(__dirname, 'lpreload.js'), contextIsolation: true } });
  launcher.loadFile(path.join(__dirname, 'launcher.html'));
  launcher.on('closed', () => { launcher = null; });
}
function openGame(p) {
  if ([...games.values()].some(g => g.p === p)) return { error: 'Ez a profil már nyitva van.' };
  const R = readProfile(p);
  const win = new BrowserWindow({ width: 1600, height: 900, title: `Dead Acre · ${p}`, backgroundColor: '#0e0d0a',
    webPreferences: { partition: `game-${p}-${Date.now()}`, preload: path.join(__dirname, 'preload.js'), contextIsolation: true } }); // an in-memory session: the file is the only copy on disk
  const G = { p, data: R.data, win, quitOk: false }; games.set(win.webContents.id, G);
  win.webContents.setUserAgent(win.webContents.getUserAgent() + ' DeadAcreApp');
  win.on('page-title-updated', e => e.preventDefault()); // the title keeps the profile's name
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); } });
  win.webContents.on('will-prevent-unload', e => { // the game asks before leaving: the app asks the same with a real dialog
    if (process.env.DA_USERDATA) return e.preventDefault(); // tests close without asking
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Kilépés', 'Maradok'], defaultId: 1, cancelId: 1, title: 'Dead Acre', message: 'Biztosan kilépsz?', detail: 'A mentés el van tárolva; munka közben a félbehagyott munka elveszhet.' });
    if (r === 0) e.preventDefault();
  });
  win.webContents.on('before-input-event', (e, i) => { if (i.type === 'keyDown' && i.control && i.shift && i.key.toLowerCase() === 'i') e.preventDefault(); });
  const id = win.webContents.id;
  win.on('closed', () => { games.delete(id); if (launcher) launcher.webContents.send('da-open', [...games.values()].map(g => g.p)); });
  win.loadURL(GAME);
  return { ok: true, tampered: R.tampered, fromBackup: R.fromBackup, chars: chars(R.data) };
}

// the game window's storage, in and out
ipcMain.on('da-load', e => { const G = games.get(e.sender.id); e.returnValue = G ? G.data : {}; });
ipcMain.on('da-save', (e, data) => {
  const G = games.get(e.sender.id); if (!G || !data || typeof data !== 'object') return (e.returnValue = false);
  try { writeProfile(G.p, data); G.data = data; e.returnValue = true; } catch (err) { e.returnValue = false; }
});
// the launcher
ipcMain.handle('l-start', async e => {
  const send = (p, t) => e.sender.send('l-progress', p, t);
  send(.05, 'Böngésző-mentések keresése'); const report = await importBrowsers(send);
  return { report, profiles: listProfiles().map(p => ({ p, n: chars(readProfile(p).data) })), open: [...games.values()].map(g => g.p) };
});
ipcMain.handle('l-open', async (e, p) => {
  p = cleanName(p); if (!p) return { error: 'Adj meg egy nevet.' };
  e.sender.send('l-progress', .4, 'Mentés betöltése és ellenőrzése');
  if (!fs.existsSync(saveFile(p))) writeProfile(p, {}); // a new, empty profile
  const r = openGame(p); e.sender.send('l-progress', 1, r.error || 'Indul');
  return Object.assign(r, { open: [...games.values()].map(g => g.p) });
});
ipcMain.handle('l-folder', () => root());

app.whenReady().then(async () => {
  if (process.env.DA_TEST_PROFILE) { if (!fs.existsSync(saveFile(process.env.DA_TEST_PROFILE))) writeProfile(process.env.DA_TEST_PROFILE, {}); openGame(process.env.DA_TEST_PROFILE); return; }
  openLauncher();
});
app.on('window-all-closed', () => app.quit());
module.exports = { seal, unseal };
