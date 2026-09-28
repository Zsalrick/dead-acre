// ================= ICONS: the game's own little pictures, never emoji or font symbols =================
// Strings all over the game still say ⚙, ★, ◆ … as short tokens; whatever reaches the page is swapped for these SVGs
// (a MutationObserver on the document), so a font never gets to draw them. Canvas text and SVG <text> use icPaths directly.
const IC = (() => {
  const P = (pts, cls = '') => `<polygon${cls} points="${pts.map(p => p.map(v => +v.toFixed(2)).join(',')).join(' ')}"/>`;
  const star = (n, R, r, cx = 8, cy = 8, rot = -Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => { const a = rot + i * Math.PI / n, d = i % 2 ? r : R; return [cx + Math.cos(a) * d, cy + Math.sin(a) * d]; });
  const gear = () => { const pts = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; for (const [da, d] of [[-.3, 5.2], [-.2, 7.4], [.2, 7.4], [.3, 5.2]]) pts.push([8 + Math.cos(a + da) * d, 8 + Math.sin(a + da) * d]); }
    return `<path fill-rule="evenodd" d="M${pts.map(p => p.map(v => v.toFixed(2)).join(' ')).join(' L')} Z M8 5.6 A2.4 2.4 0 1 0 8 10.4 A2.4 2.4 0 1 0 8 5.6 Z"/>`; };
  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return {
    gear: gear(),
    fabric: `<path fill-rule="evenodd" d="M1.5 1.5h13v13h-13z M3.3 3.3h3.9v3.9H3.3z M8.8 3.3h3.9v3.9H8.8z M3.3 8.8h3.9v3.9H3.3z M8.8 8.8h3.9v3.9H8.8z"/>`,
    core: P([[8, 1], [14.5, 8], [8, 15], [1.5, 8]]) + `<polygon points="8,4 11,8 8,12 5,8" fill="rgba(0,0,0,.35)"/>`,
    star: P(star(5, 7.4, 3.1)),
    starO: `<polygon points="${star(5, 6.6, 2.8).map(p => p.map(v => v.toFixed(2)).join(',')).join(' ')}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>`,
    skull: `<path fill-rule="evenodd" d="M8 1.5C4.3 1.5 2 4 2 7.2c0 2 1 3.4 2.4 4.1V14h7.2v-2.7C13 10.6 14 9.2 14 7.2 14 4 11.7 1.5 8 1.5z M5.8 6.2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z M10.2 6.2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z M8 9.6l-1 1.6h2z M6.4 12.3v1.7h1v-1.7z M8.6 12.3v1.7h1v-1.7z"/>`,
    trash: `<path fill-rule="evenodd" d="M6 1.5h4l.6 1.5H14v2H2V3h3.4z M3.2 6h9.6l-.9 8.5H4.1z M6 7.5v5.5h1.2V7.5z M8.8 7.5v5.5H10V7.5z"/>`,
    check: `<polyline points="2.5,8.5 6.5,12.5 13.5,3.5" ${S}/>`,
    x: `<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" ${S}/>`,
    spark: P(star(4, 7.5, 2.2)),
    burst: P(star(8, 7.5, 3.6)),
    target: `<circle cx="8" cy="8" r="5.8" ${S.replace('2"', '1.6"')}/><circle cx="8" cy="8" r="2.4"/>`,
    square: `<path fill-rule="evenodd" d="M1.5 1.5h13v13h-13z M3.5 3.5v9h9v-9z M5.5 5.5h5v5h-5z"/>`,
    bolt: P([[9.5, .8], [3, 9], [7.4, 9], [6.2, 15.2], [13, 6.6], [8.6, 6.6]]),
    half: `<path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 1 0 0-13z M8 3.3v9.4a4.7 4.7 0 0 1 0-9.4z"/>`,
    drop: `<path d="M8 1C8 1 3 7.2 3 10.2A5 5 0 0 0 13 10.2C13 7.2 8 1 8 1z"/>`,
    heart: `<path d="M8 14.2S1.5 10 1.5 5.6A3.4 3.4 0 0 1 8 4a3.4 3.4 0 0 1 6.5 1.6C14.5 10 8 14.2 8 14.2z"/>`,
    snow: `<path d="M8 1.5v13M2.4 4.8l11.2 6.4M13.6 4.8L2.4 11.2M6.3 2.6L8 4.2l1.7-1.6M6.3 13.4L8 11.8l1.7 1.6" ${S.replace('2"', '1.5"')}/>`,
    up: P([[8, 2.5], [14, 12.5], [2, 12.5]]), down: P([[2, 3.5], [14, 3.5], [8, 13.5]]),
    right: P([[3.5, 2], [13.5, 8], [3.5, 14]]), left: P([[12.5, 2], [2.5, 8], [12.5, 14]]),
    arrow: P([[1.5, 3], [14.5, 8], [1.5, 13], [4.5, 8]]),
    refresh: `<path d="M13 8a5 5 0 1 1-1.6-3.7" ${S}/><polygon points="14.5,1.5 14.5,6.5 9.5,6.5"/>`,
    plus: P([[6, 1.5], [10, 1.5], [10, 6], [14.5, 6], [14.5, 10], [10, 10], [10, 14.5], [6, 14.5], [6, 10], [1.5, 10], [1.5, 6], [6, 6]]),
    cross: `<circle cx="8" cy="8" r="5" ${S.replace('2"', '1.6"')}/><path d="M8 .8v4.4M8 10.8v4.4M.8 8h4.4M10.8 8h4.4" ${S.replace('2"', '1.6"')}/>`,
    shield: `<path d="M8 1L2.5 3v4.6c0 3.4 2.3 5.9 5.5 7.4 3.2-1.5 5.5-4 5.5-7.4V3z"/>`,
    crown: P([[1.5, 4], [5, 7.5], [8, 2.5], [11, 7.5], [14.5, 4], [13.2, 12], [2.8, 12]]) + `<rect x="2.8" y="12.8" width="10.4" height="1.8"/>`,
    note: `<path d="M6 12.5a2.2 2.2 0 1 1-1-1.8V2.5l8-1.5v9.5a2.2 2.2 0 1 1-1-1.8V3.4L6 4.6z"/>`,
    dot: `<circle cx="8" cy="8" r="5"/>`,
    chevrons: `<path d="M2.5 3.5L7 8l-4.5 4.5M8.5 3.5L13 8l-4.5 4.5" ${S}/>`,
  };
})();
const IC_CHAR = { '⚙': 'gear', '▦': 'fabric', '◆': 'core', '★': 'star', '☆': 'starO', '☠': 'skull', '🗑': 'trash', '✓': 'check', '✕': 'x', '✖': 'x',
  '✧': 'spark', '✦': 'spark', '✹': 'burst', '◎': 'target', '▣': 'square', '↯': 'bolt', '◐': 'half', '♦': 'drop', '♥': 'heart', '❄': 'snow',
  '▲': 'up', '▼': 'down', '▶': 'right', '◀': 'left', '➤': 'arrow', '↻': 'refresh', '✚': 'plus', '⌖': 'cross', '⛨': 'shield', '♛': 'crown', '♪': 'note', '●': 'dot', '»': 'chevrons' };
const icPaths = name => IC[name] || '';
const ic = (name, cls = '') => `<svg class="ic ic-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${icPaths(name)}</svg>`;
// the swap: text nodes that carry a token become text + icons (not inside SVG, inputs or scripts)
const IC_RE = new RegExp(`[${Object.keys(IC_CHAR).join('').replace(/[\]\\^-]/g, '\\$&')}]`, 'u'), IC_RE_G = new RegExp(IC_RE.source, 'gu');
function icSwap(node) {
  if (node.nodeType === 3) {
    const p = node.parentNode; if (!p || !IC_RE.test(node.data) || p.namespaceURI !== 'http://www.w3.org/1999/xhtml' || /^(SCRIPT|STYLE|TEXTAREA|OPTION|TITLE)$/.test(p.nodeName)) return;
    const t = document.createElement('template'); t.innerHTML = node.data.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(IC_RE_G, c => ic(IC_CHAR[c]));
    p.replaceChild(t.content, node); return;
  }
  if (node.nodeType === 1 && node.namespaceURI === 'http://www.w3.org/1999/xhtml' && !/^(SCRIPT|STYLE|TEXTAREA)$/.test(node.nodeName)) {
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), list = []; while (w.nextNode()) if (IC_RE.test(w.currentNode.data)) list.push(w.currentNode);
    list.forEach(icSwap);
  }
}
new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') icSwap(m.target); else m.addedNodes.forEach(icSwap); } })
  .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
addEventListener('DOMContentLoaded', () => icSwap(document.body));
