// The game window: before the game's scripts run, its storage is filled from the profile's sealed file;
// every change goes back to that file a moment later (and once more when the page goes away).
const { ipcRenderer } = require('electron');
if (location.origin === 'https://zsalrick.github.io') {
  const data = ipcRenderer.sendSync('da-load') || {};
  localStorage.clear(); for (const k in data) localStorage.setItem(k, data[k]);
  let last = JSON.stringify(data);
  const snap = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; };
  const flush = () => { const o = snap(), s = JSON.stringify(o); if (s !== last && ipcRenderer.sendSync('da-save', o)) last = s; };
  setInterval(flush, 2000);
  addEventListener('pagehide', flush);
  addEventListener('beforeunload', flush);
}
