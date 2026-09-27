// ================= P2P TRANSPORT (outside claude.ai) =================
// The same small room interface net.js uses on claude.ai (peers / onPeers / presence / join / leave), built on PeerJS:
// the party leader's browser is the hub, everyone connects to it with a short code, and it relays each player's
// presence to the others. PeerJS's free public server only introduces the browsers; the game data then flows
// directly between them (WebRTC). No accounts, no sign-in.
const P2P = {
  available: () => typeof window.Peer === 'function',
  lobby() { // there is no shared lobby: parties are joined by code
    return { p2p: true, peers: () => [], onPeers: () => () => {}, presence: async () => {}, join: (name, opt = {}) => P2P.join(name.replace(/^p-/, ''), !!opt.host) };
  },
  join(code, host) {
    return new Promise((resolve, reject) => {
      const hostId = 'deadacre-' + code, peer = host ? new Peer(hostId) : new Peer();
      const conns = new Map(), others = new Map(), subs = [];
      let me = null, mine = {}, snap = Object.freeze([]), last = 0, timer = null, done = false, lost = null;
      const view = (peerId, presence, self) => ({ peer: peerId, sameTab: self, isMe: self, kind: 'viewer', guest: false, by: null, presence, updatedAt: Date.now() });
      const build = () => {
        snap = Object.freeze([view(me, mine, true), ...[...others].map(([p, pr]) => view(p, pr, false))]);
        subs.forEach(f => { try { f({ peers: snap, joined: [], left: [], updated: [] }); } catch (e) {} });
      };
      const sendAll = msg => { for (const c of conns.values()) if (c.open) try { c.send(msg); } catch (e) {} };
      const flush = () => { timer = null; last = performance.now(); sendAll({ t: 'p', peer: me, p: mine }); };
      const wire = c => {
        c.on('data', d => {
          if (!d || typeof d !== 'object') return;
          if (d.t === 'p') {
            const from = host ? c.peer : d.peer; // the hub knows who sent it; members trust the hub's label
            if (!from || from === me || typeof d.p !== 'object') return;
            others.set(from, Object.freeze(d.p || {}));
            if (host) for (const [k, o] of conns) if (k !== c.peer && o.open) try { o.send({ t: 'p', peer: from, p: d.p }); } catch (e) {}
            build();
          } else if (d.t === 'bye' && d.peer) { others.delete(d.peer); build(); }
        });
        c.on('close', () => {
          conns.delete(c.peer);
          if (host) { others.delete(c.peer); sendAll({ t: 'bye', peer: c.peer }); build(); }
          else { others.clear(); build(); if (lost && !done) lost({ code: 'upstream_error', message: 'A kapcsolat megszakadt.' }); }
        });
      };
      const api = {
        name: code, p2p: true,
        peers: () => snap,
        onPeers(f, onErr) { subs.push(f); if (onErr) lost = onErr; setTimeout(() => f({ peers: snap, joined: snap, left: [], updated: [] }), 0); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; },
        async presence(patch) {
          const m = Object.assign({}, mine); for (const k in patch) { if (patch[k] === null) delete m[k]; else m[k] = patch[k]; }
          mine = m; snap = Object.freeze([view(me, mine, true), ...snap.slice(1)]);
          if (!timer) timer = setTimeout(flush, Math.max(0, 33 - (performance.now() - last))); // about 30 sends a second
        },
        emit: async () => {}, on: () => () => {}, connected: () => host || conns.size > 0,
        async leave() { done = true; sendAll({ t: 'bye', peer: me }); setTimeout(() => peer.destroy(), 100); },
      };
      const fail = e => { if (!done) { done = true; try { peer.destroy(); } catch (x) {} reject(e); } };
      const to = setTimeout(() => fail(new Error('timeout')), 12000);
      peer.on('open', id => {
        me = id; build();
        if (host) {
          peer.on('connection', c => {
            conns.set(c.peer, c); wire(c);
            c.on('open', () => { c.send({ t: 'p', peer: me, p: mine }); for (const [p, pr] of others) c.send({ t: 'p', peer: p, p: pr }); });
          });
          clearTimeout(to); resolve(api);
        } else {
          const c = peer.connect(hostId, { reliable: true }); conns.set(hostId, c); wire(c);
          c.on('open', () => { clearTimeout(to); flush(); resolve(api); });
        }
      });
      peer.on('error', e => { if (me && host && e.type !== 'unavailable-id') return; fail(e); });
    });
  },
};
