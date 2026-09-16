/* ============================================================
   SERVER — runs the game for two computers on the same network.

       npm install
       node server.js

   then open the printed address on both machines. First browser to
   arrive is HOME, second is AWAY, everyone after that just watches
   (put one on the projector).

   This is the only place the simulation runs. It loads the very same
   config.js / engine.js / game.js the browser uses, ticks the play
   sixty times a second, and streams the state to everyone connected.
   Browsers send back nothing but intentions.
   ============================================================ */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const os   = require('os');
const { WebSocketServer } = require('ws');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

/* ---- load the game into this process the way a browser would:
        same files, same order, same shared globals ---- */
const bundle = ['js/config.js', 'js/engine.js', 'js/game.js']
  .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') +
  `\nglobalThis.GAME = { CFG, UNITS, G, startGame, startRound, choosePlay, snap, endPlay,
     attemptFieldGoal, attemptExtraPoint, goForTwo, advance, updatePlay };`;
vm.runInThisContext(bundle, { filename: 'game-bundle.js' });
const { CFG, UNITS, G, startGame, startRound, choosePlay, snap, endPlay,
        attemptFieldGoal, attemptExtraPoint, goForTwo, advance, updatePlay } = globalThis.GAME;

/* ---- static files ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/online.html';
  const file = path.normalize(path.join(ROOT, url));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                       'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});

/* ---- who is here ---- */
const players = [null, null];            // sockets for HOME and AWAY
const names   = ['HOME', 'AWAY'];
const ready   = [false, false];

const heldBoost = { DL: false, LB: false, CB: false, S: false };   // defense's keys
let pendingThrow = -1;
let resultHandled = false;
let lastAdvance = 0;

const who = ws => ws.team < 0 ? 'a spectator' : names[ws.team];
const log = s => console.log(`  ${new Date().toLocaleTimeString()}  ${s}`);

const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
  const slot = players.indexOf(null);
  ws.team = slot;                        // -1 => spectator
  if (slot >= 0) players[slot] = ws;
  ws.send(JSON.stringify({ type: 'hello', team: slot }));
  log(`${who(ws)} connected`);
  broadcast();

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    handle(ws, m);
  });
  ws.on('close', () => {
    if (ws.team >= 0) { players[ws.team] = null; ready[ws.team] = false; }
    log(`${who(ws)} left`);
    /* one player refreshing keeps the game alive for them to rejoin;
       if BOTH seats empty out, go back to the lobby for the next pair */
    if (!players[0] && !players[1] && G.phase !== 'MENU') {
      G.phase = 'MENU';
      log('both seats empty — back to the lobby');
    }
    broadcast();
  });
});

/* ---- one message from one browser ---- */
function handle(ws, m) {
  const team  = ws.team;
  const live  = G.phase !== 'MENU';
  const isOff = team >= 0 && live && team === G.possIndex;
  const isDef = team >= 0 && live && team !== G.possIndex;

  switch (m.type) {
    case 'ready': {
      if (team < 0 || live) return;
      const n = String(m.name || '').trim().slice(0, 10).toUpperCase();
      if (n) names[team] = n;
      ready[team] = true;
      if (ready[0] && ready[1] && players[0] && players[1]) {
        log(`kickoff — ${names[0]} vs ${names[1]}`);
        startGame(names[0], names[1]);
      }
      return;
    }

    /* --- offense only --- */
    case 'play': {
      const i = Number(m.idx);
      if (isOff && i >= 0 && i < 4) choosePlay(i);
      return;
    }
    case 'snap':  if (isOff) { pendingThrow = -1; snap(); } return;
    case 'fg':    if (isOff && G.phase === 'PRESNAP' && !G.isPAT && G.down === 4) attemptFieldGoal(); return;
    case 'throw': {
      const i = Number(m.idx);
      if (isOff && G.phase === 'LIVE' && i >= 0 && i < 4) pendingThrow = i;
      return;
    }
    case 'xp':    if (isOff && G.phase === 'PAT_CHOICE') attemptExtraPoint(); return;
    case 'two':   if (isOff && G.phase === 'PAT_CHOICE') goForTwo(); return;

    /* --- defense only (anyone may let go, only the defense may press) --- */
    case 'boost':
      if (!(m.unit in heldBoost)) return;
      if (m.on && !isDef) return;
      heldBoost[m.unit] = !!m.on;
      return;

    /* --- either player --- */
    case 'advance': {
      if (team < 0) return;
      const now = Date.now();
      if (now - lastAdvance < 400) return;         // both hit space: count it once
      lastAdvance = now;
      if (G.phase === 'RESULT') { advance(); resultHandled = false; }
      else if (G.phase === 'BREAK') startRound();
      return;
    }
    case 'restart':
      if (team < 0 || G.phase !== 'GAMEOVER') return;
      G.phase = 'MENU';
      ready[0] = ready[1] = false;
      log('back to the lobby');
      return;
  }
}

/* ---- the loop: the same three steps main.js runs in the browser ---- */
let last = Date.now();
let tickNo = 0;

setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const sdt = dt * CFG.TEMPO;

  if (G.phase === 'LIVE' && G.play) {
    const wanted = {};
    let drains = 0;
    for (const u in UNITS) { wanted[u] = heldBoost[u] && G.energy > 0; if (wanted[u]) drains++; }
    G.energy = Math.max(0, G.energy - drains * CFG.ENERGY_DRAIN * sdt);
    G.boosts = wanted;

    updatePlay(G.play, sdt, { throwAt: pendingThrow, boosts: wanted });
    pendingThrow = -1;

    if (G.play.result && !resultHandled) {
      resultHandled = true;
      setTimeout(() => endPlay(G.play.result), 700);
    }
  }

  /* stream state every tick while the ball is live, ten times a second otherwise */
  tickNo++;
  if (G.phase === 'LIVE' || tickNo % 6 === 0) broadcast();
}, 1000 / 60);

/* ---- what the browsers see. Receivers carry a position history for the
        coverage AI that nobody needs to draw, so it is stripped out. ---- */
function snapshot() {
  const { play, ...rest } = G;
  const slim = play ? { ...play, recs: play.recs.map(({ hist, ...r }) => r) } : null;
  return JSON.stringify({
    type: 'state',
    G: { ...rest, play: slim },
    lobby: { names, ready, connected: [!!players[0], !!players[1]] },
  });
}

function broadcast() {
  const msg = snapshot();
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

/* ---- go ---- */
server.listen(PORT, () => {
  console.log('\n  RED ZONE ROYALE — server up\n');
  console.log(`  this machine:    http://localhost:${PORT}`);
  for (const [name, addrs] of Object.entries(os.networkInterfaces()))
    for (const a of addrs)
      if (a.family === 'IPv4' && !a.internal)
        console.log(`  other machines:  http://${a.address}:${PORT}   (${name})`);
  console.log('\n  first to open it is HOME, second is AWAY, everyone else watches.\n');
});
