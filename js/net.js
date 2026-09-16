/* ============================================================
   NET — the two-computer client. Replaces main.js.

   Nothing is simulated here. The server owns the game and streams us
   its state many times a second; we draw it and send our intentions
   back: "call play 2", "snap", "throw to WR1", "I'm holding the rush
   key". On a LAN the round trip is a couple of milliseconds, which is
   why something this simple works — no prediction, no rollback.

   Which side you are on is not fixed. You are on offense whenever
   your team has the ball, and the controls and HUD follow.
   ============================================================ */

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');

let myTeam = -1;                           // 0, 1, or -1 if just watching
let lobby = { names: ['HOME', 'AWAY'], ready: [false, false], connected: [false, false] };
let connected = false;

const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
const send = o => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };

ws.onopen  = () => { connected = true; };
ws.onclose = () => { connected = false; };
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.type === 'hello') {
    myTeam = m.team;
    const inp = document.getElementById('myname');
    if (!inp.value) inp.value = myTeam === 0 ? 'HOME' : myTeam === 1 ? 'AWAY' : '';
  } else if (m.type === 'state') {
    Object.assign(G, m.G);                 // the server's truth becomes ours
    lobby = m.lobby;
  }
};

function myRole() {
  if (myTeam < 0) return 'spec';
  return myTeam === G.possIndex ? 'off' : 'def';
}

/* The HUD's buttons call these. Online, each one is a message. */
Object.assign(ACT, {
  choosePlay: i => send({ type: 'play', idx: i }),
  snap:       () => send({ type: 'snap' }),
  fieldGoal:  () => send({ type: 'fg' }),
  throwTo:    i => send({ type: 'throw', idx: i }),
  xp:         () => send({ type: 'xp' }),
  two:        () => send({ type: 'two' }),
  advance:    () => send({ type: 'advance' }),
  nextRound:  () => send({ type: 'advance' }),
  restart:    () => send({ type: 'restart' }),
});

/* ---------------- input ---------------- */

const held = {};
const unitForKey = k => Object.keys(UNITS).find(u => UNITS[u].key === k);

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (held[k]) return;
  held[k] = true;
  if (k === ' ') e.preventDefault();

  if (G.phase === 'MENU') { if (k === 'enter') sendReady(); return; }

  /* defense: hold a unit key to pour energy into it */
  const unit = unitForKey(k);
  if (unit) { if (isDef() && myTeam >= 0) send({ type: 'boost', unit, on: true }); return; }

  switch (G.phase) {
    case 'PRESNAP':
      if (!isOff()) break;
      if (k >= '1' && k <= '4') ACT.choosePlay(+k - 1);
      else if (k === 'g' && canKick()) ACT.fieldGoal();
      else if (k === ' ') ACT.snap();
      break;

    case 'LIVE': {
      if (!isOff()) break;
      const i = TARGETS.findIndex(t => t.key === k);
      if (i >= 0) ACT.throwTo(i);
      break;
    }

    case 'PAT_CHOICE':
      if (!isOff()) break;
      if (k === '1') ACT.xp();
      else if (k === '2') ACT.two();
      break;

    case 'RESULT':
    case 'BREAK':
      if (k === ' ' && myTeam >= 0) ACT.advance();   // either player may continue
      break;

    case 'GAMEOVER':
      if (k === ' ' && myTeam >= 0) ACT.restart();
      break;
  }
});

document.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  held[k] = false;
  const unit = unitForKey(k);
  if (unit) send({ type: 'boost', unit, on: false });
});

/* ---------------- lobby ---------------- */

function sendReady() {
  if (myTeam < 0) return;
  const name = document.getElementById('myname').value.trim() || (myTeam === 0 ? 'HOME' : 'AWAY');
  send({ type: 'ready', name });
}
document.getElementById('readybtn').onclick = sendReady;

function netUI() {
  const inMenu = G.phase === 'MENU';
  document.getElementById('menu').classList.toggle('hidden', !inMenu);

  if (inMenu) {
    const slot = document.getElementById('slotinfo');
    const st = document.getElementById('lobbystatus');
    const btn = document.getElementById('readybtn');
    const other = 1 - myTeam;

    if (!connected)      slot.textContent = 'CONNECTING…';
    else if (myTeam < 0) slot.textContent = 'SPECTATING — both seats are taken';
    else slot.innerHTML = `YOU ARE <b class="${myTeam === 0 ? 'homec' : 'awayc'}">${myTeam === 0 ? 'HOME' : 'AWAY'}</b>` +
                          (myTeam === 0 ? ' — you get the ball first' : ' — you start on defense');

    if (myTeam < 0)                    st.textContent = `${lobby.names[0]} ${lobby.ready[0] ? '✓' : '…'}  vs  ${lobby.names[1]} ${lobby.ready[1] ? '✓' : '…'}`;
    else if (!lobby.connected[other])  st.textContent = 'Waiting for your opponent to open this page…';
    else if (!lobby.ready[other])      st.textContent = `${lobby.names[other]} is here — waiting for them to hit READY`;
    else if (!lobby.ready[myTeam])     st.textContent = `${lobby.names[other]} is ready. Hit READY to kick off.`;
    else                               st.textContent = 'Kicking off…';

    btn.textContent = lobby.ready[myTeam] ? 'READY ✓' : 'READY';
    btn.disabled = myTeam < 0;
  }

  /* lost the server, or the other player closed their tab mid-game */
  const nb = document.getElementById('netbanner');
  const other = 1 - myTeam;
  const dropped = !inMenu && myTeam >= 0 && !lobby.connected[other];
  if (!connected)  nb.innerHTML = '<h2>DISCONNECTED</h2><p>Lost the server. Is it still running?</p>';
  else if (dropped) nb.innerHTML = `<h2>OPPONENT LEFT</h2><p>Waiting for ${lobby.names[other]} to come back…</p>`;
  nb.classList.toggle('hidden', connected && !dropped);
}

/* ---------------- the loop: just draw what we were told ---------------- */

function frame() {
  VIEW.role = myRole();
  render(ctx, G);
  syncUI();
  netUI();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
