/* ============================================================
   MAIN — input, the game loop, and syncing the HTML HUD.

   The loop is the classic three steps, sixty times a second:
       read input  ->  update state  ->  draw state
   ============================================================ */

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');

const held = {};            // which keys are currently down
let pendingThrow = -1;      // set by a keypress, consumed by the next update
let resultHandled = false;

/* ---------------- input ---------------- */

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (held[k]) return;      // ignore auto-repeat
  held[k] = true;

  if (k === ' ') e.preventDefault();

  switch (G.phase) {
    case 'MENU':
      if (k === 'enter') beginFromMenu();
      break;

    case 'PRESNAP':
      if (k >= '1' && k <= '4') choosePlay(+k - 1);
      else if (k === 'g' && canKick()) attemptFieldGoal();
      else if (k === ' ') snap();   // no-ops until a play has been called
      break;

    case 'LIVE': {
      const i = TARGETS.findIndex(t => t.key === k);
      if (i >= 0) pendingThrow = i;
      break;
    }

    case 'RESULT':
      if (k === ' ') { advance(); resultHandled = false; }
      break;

    case 'PAT_CHOICE':
      if (k === '1') attemptExtraPoint();
      else if (k === '2') goForTwo();
      break;

    case 'BREAK':
      if (k === ' ') startRound();
      break;

    case 'GAMEOVER':
      if (k === ' ') location.reload();
      break;
  }
});

document.addEventListener('keyup', e => { held[e.key.toLowerCase()] = false; });

function canKick() { return G.phase === 'PRESNAP' && !G.isPAT && G.down === 4; }

/* ---------------- menu ---------------- */

function beginFromMenu() {
  startGame(document.getElementById('name0').value,
            document.getElementById('name1').value);
  document.getElementById('menu').classList.add('hidden');
}
document.getElementById('startbtn').onclick = beginFromMenu;

/* ---------------- the loop ---------------- */

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  /* The simulation runs on a slowed clock so a play is readable. One dial
     scales everything at once — speeds, blocking, ball flight, energy —
     which keeps the balance between them exactly as tuned. */
  const sdt = dt * CFG.TEMPO;

  if (G.phase === 'LIVE' && G.play) {
    /* defense pours energy into whichever units are held */
    const wanted = {};
    let drains = 0;
    for (const u in UNITS) {
      const on = !!held[UNITS[u].key] && G.energy > 0;
      wanted[u] = on;
      if (on) drains++;
    }
    G.energy = Math.max(0, G.energy - drains * CFG.ENERGY_DRAIN * sdt);
    G.boosts = wanted;

    updatePlay(G.play, sdt, { throwAt: pendingThrow, boosts: wanted });
    pendingThrow = -1;

    if (G.play.result && !resultHandled) {
      resultHandled = true;
      setTimeout(() => endPlay(G.play.result), 700);   // let the moment land
    }
  }

  render(ctx, G);
  syncUI();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------------- HUD ---------------- */

let uiKey = '';

function syncUI() {
  /* scoreboard */
  for (let i = 0; i < 2; i++) {
    const el = document.getElementById('team' + i);
    el.querySelector('.tname').textContent = G.teams[i].name;
    el.querySelector('.tscore').textContent = G.teams[i].score;
    el.classList.toggle('hasball', G.phase !== 'MENU' && G.possIndex === i);
  }
  document.getElementById('roundlabel').textContent =
    isShootoutRound() ? `ROUND ${G.round} · SHOOTOUT` : `ROUND ${G.round}`;
  document.getElementById('downlabel').textContent =
    (G.phase === 'MENU' || G.phase === 'GAMEOVER') ? '—'
    : G.phase === 'BREAK' ? 'NEXT ROUND'
    : G.isPAT ? '2-PT TRY'
    : `${ordinal(G.down)} & ${Math.ceil(G.toGo)}  ·  ${Math.round(G.ballX)} YD`;

  /* energy */
  document.getElementById('energyfill').style.width =
    (G.energy / CFG.ENERGY_POOL * 100) + '%';
  document.querySelectorAll('.unit').forEach(u => {
    u.classList.toggle('on', !!G.boosts[u.dataset.unit] && G.energy > 0);
  });

  /* the part of the HUD that changes shape — only rebuild when needed */
  const key = [G.phase, G.down, G.selectedPlay, G.round, G.message,
               G.pendingPAT, G.playChosen, G.possIndex].join('|');
  if (key !== uiKey) { uiKey = key; buildPlaybox(); buildPicker(); buildBanner(); }
}

function buildPlaybox() {
  const label = document.getElementById('playlabel');
  const box = document.getElementById('playcards');

  if (G.phase === 'PRESNAP' && !G.playChosen) {
    label.textContent = 'WAITING ON THE PLAY CALL';
    box.innerHTML = `<div class="narrate">Offense is picking. Defense, get your left hand on
      <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>.</div>`;

  } else if (G.phase === 'PRESNAP') {
    const p = PLAYS[G.selectedPlay];
    label.textContent = 'READY';
    box.innerHTML = `
      <div class="called">
        <span class="ctag">PLAY CALLED</span>
        <span class="cname big">${p.name}</span>
        <span class="cblurb">${p.blurb}</span>
        <span class="hint">SPACE TO SNAP</span>
        <span class="cblurb dimmer">${'1'}-4 to change the call</span>
      </div>` +
      (canKick() ? `<button class="card kick" data-kick="1">
        <span class="num">G</span>
        <span class="cname">FIELD GOAL</span>
        <span class="ctag">${Math.round(G.ballX + 17)} YARDS</span>
        <span class="cblurb">${Math.round(fieldGoalChance() * 100)}% chance. Three points and the ball goes back.</span>
      </button>` : '');
    const kb = box.querySelector('[data-kick]');
    if (kb) kb.onclick = attemptFieldGoal;

  } else if (G.phase === 'LIVE') {
    label.textContent = 'THROW IT';
    box.innerHTML = TARGETS.map(t => `
      <button class="card live">
        <span class="num">${t.label}</span>
        <span class="cname">${t.name}</span>
      </button>`).join('');

  } else if (G.phase === 'RESULT') {
    label.textContent = G.message;
    box.innerHTML = `<div class="narrate">${G.sub}<br><span class="hint">PRESS SPACE</span></div>`;

  } else if (G.phase === 'PAT_CHOICE') {
    label.textContent = 'AFTER THE TOUCHDOWN';
    box.innerHTML = `
      <button class="card" data-xp="1"><span class="num">1</span><span class="cname">KICK PAT</span>
        <span class="ctag">${Math.round(CFG.XP_MAKE * 100)}%</span><span class="cblurb">One point, nearly automatic.</span></button>
      <button class="card" data-two="1"><span class="num">2</span><span class="cname">GO FOR TWO</span>
        <span class="ctag">HIGH RISK</span><span class="cblurb">One snap from the three for two points.</span></button>`;
    box.querySelector('[data-xp]').onclick = attemptExtraPoint;
    box.querySelector('[data-two]').onclick = goForTwo;

  } else {
    label.textContent = '';
    box.innerHTML = '';
  }
}

function buildPicker() {
  const pp = document.getElementById('playpicker');
  if (G.phase !== 'PRESNAP' || G.playChosen) { pp.classList.add('hidden'); return; }
  pp.classList.remove('hidden');
  pp.querySelector('.ppttl').textContent =
    G.isPAT ? `${G.teams[G.possIndex].name} — TWO-POINT TRY` : `${G.teams[G.possIndex].name} — CALL YOUR PLAY`;

  const cards = document.getElementById('ppcards');
  cards.innerHTML = PLAYS.map((p, i) => `
    <button class="card pp" data-play="${i}">
      <span class="num">${i + 1}</span>
      <span class="cname">${p.name}</span>
      <span class="ctag">${p.tag}</span>
      <span class="cblurb">${p.blurb}</span>
    </button>`).join('') +
    (!G.isPAT && G.down === 4 ? `<button class="card pp kick" data-kick="1">
      <span class="num">G</span>
      <span class="cname">FIELD GOAL</span>
      <span class="ctag">${Math.round(G.ballX + 17)} YARDS</span>
      <span class="cblurb">${Math.round(fieldGoalChance() * 100)}% chance. Three points, and the other team gets the ball.</span>
    </button>` : '');
  cards.querySelectorAll('[data-play]').forEach(b =>
    b.onclick = () => choosePlay(+b.dataset.play));
  const kb = cards.querySelector('[data-kick]');
  if (kb) kb.onclick = attemptFieldGoal;
}

function buildBanner() {
  const b = document.getElementById('banner');
  if (G.phase === 'BREAK' || G.phase === 'GAMEOVER') {
    b.classList.remove('hidden');
    b.innerHTML = `<h2>${G.message}</h2><p>${G.sub}</p>
      <span class="hint">PRESS SPACE</span>`;
  } else {
    b.classList.add('hidden');
  }
}
