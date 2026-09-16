/* ============================================================
   HUD — the HTML around the canvas: scoreboard, energy bar,
   play cards and banners.

   Shared by both ways of playing:
     main.js  hot-seat, one keyboard     VIEW.role = 'both'
     net.js   two computers              VIEW.role = 'off' | 'def' | 'spec'

   It never touches game state. Every button goes through ACT, which
   the mode file fills in — locally that calls the rulebook directly,
   online it sends a message to the server. That indirection is the
   whole reason the same HUD can drive both.
   ============================================================ */

const ACT  = {};                    // filled in by main.js or net.js
const VIEW = { role: 'both' };      // what this screen may see and do

const isOff = () => VIEW.role === 'both' || VIEW.role === 'off';
const isDef = () => VIEW.role === 'both' || VIEW.role === 'def';

function canKick() { return G.phase === 'PRESNAP' && !G.isPAT && G.down === 4; }

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
               G.pendingPAT, G.playChosen, G.possIndex, VIEW.role].join('|');
  if (key !== uiKey) { uiKey = key; buildPlaybox(); buildPicker(); buildBanner(); }
}

/* ---------------- shared card markup ---------------- */

function playCard(i, extraClass) {
  const p = PLAYS[i];
  return `<button class="card ${extraClass}" data-play="${i}">
    <span class="num">${i + 1}</span>
    <span class="cname">${p.name}</span>
    <span class="ctag">${p.tag}</span>
    <span class="cblurb">${p.blurb}</span>
  </button>`;
}

function fgCard(extraClass) {
  const d = kickDistance();
  return `<button class="card kick ${extraClass}" data-kick="1">
    <span class="num">G</span>
    <span class="cname">FIELD GOAL</span>
    <span class="ctag">${d} YARDS · ${kickDifficulty(d)}</span>
    <span class="cblurb">Three points if you hit the meter. The other team gets the ball either way.</span>
  </button>`;
}

function wireCards(root) {
  root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => ACT.choosePlay(+b.dataset.play));
  const kb = root.querySelector('[data-kick]');
  if (kb) kb.onclick = () => ACT.fieldGoal();
}

const offName = () => G.teams[G.possIndex].name;

/* ---------------- bottom bar ---------------- */

function buildPlaybox() {
  const label = document.getElementById('playlabel');
  const box = document.getElementById('playcards');

  if (G.phase === 'PRESNAP' && !G.playChosen) {
    if (isOff()) {
      label.textContent = 'CALL A PLAY';
      box.innerHTML = `<div class="narrate">Pick from the cards above.</div>`;
    } else {
      label.textContent = 'WAITING ON THE PLAY CALL';
      box.innerHTML = `<div class="narrate">${offName()} is picking a play. Defense, get your
        left hand on <kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd>.</div>`;
    }

  } else if (G.phase === 'PRESNAP') {
    if (isOff()) {
      const p = PLAYS[G.selectedPlay];
      label.textContent = 'READY';
      box.innerHTML = `
        <div class="called">
          <span class="ctag">PLAY CALLED</span>
          <span class="cname big">${p.name}</span>
          <span class="cblurb">${p.blurb}</span>
          <span class="hint">SPACE TO SNAP</span>
          <span class="cblurb dimmer">1-4 to change the call</span>
        </div>` + (canKick() ? fgCard('') : '');
      wireCards(box);
    } else {
      label.textContent = 'OFFENSE IS SET';
      box.innerHTML = `<div class="narrate">The ball is about to be snapped.
        Hold <kbd>A</kbd> rush &nbsp;<kbd>S</kbd> linebackers &nbsp;<kbd>D</kbd> corners &nbsp;<kbd>F</kbd> safeties.</div>`;
    }

  } else if (G.phase === 'LIVE') {
    if (isOff()) {
      label.textContent = 'THROW IT';
      box.innerHTML = TARGETS.map(t => `
        <button class="card live">
          <span class="num">${t.label}</span>
          <span class="cname">${t.name}</span>
        </button>`).join('');
    } else {
      label.textContent = 'DEFEND — HOLD TO BOOST';
      box.innerHTML = Object.entries(UNITS).map(([u, d]) => `
        <button class="card live">
          <span class="num">${d.key.toUpperCase()}</span>
          <span class="cname">${d.label}</span>
        </button>`).join('');
    }

  } else if (G.phase === 'KICK') {
    const k = G.kick;
    if (isOff()) {
      label.textContent = k.type === 'FG' ? 'FIELD GOAL' : 'EXTRA POINT';
      box.innerHTML = `<div class="narrate">Hit <kbd>space</kbd> (or click) when the marker is in the gold.
        Longer kicks: smaller window, faster marker.</div>`;
    } else {
      label.textContent = k.type === 'FG' ? 'FIELD GOAL ATTEMPT' : 'EXTRA POINT ATTEMPT';
      box.innerHTML = `<div class="narrate">${offName()} lines up a ${k.distance}-yard kick. Nothing to do but watch.</div>`;
    }

  } else if (G.phase === 'RESULT') {
    label.textContent = G.message;
    box.innerHTML = `<div class="narrate">${G.sub}<br><span class="hint">PRESS SPACE</span></div>`;

  } else if (G.phase === 'PAT_CHOICE') {
    if (isOff()) {
      label.textContent = 'AFTER THE TOUCHDOWN';
      box.innerHTML = `
        <button class="card" data-xp="1"><span class="num">1</span><span class="cname">KICK PAT</span>
          <span class="ctag">20 YARDS · CHIP SHOT</span><span class="cblurb">One point. A wide sweet spot, but you still have to hit it.</span></button>
        <button class="card" data-two="1"><span class="num">2</span><span class="cname">GO FOR TWO</span>
          <span class="ctag">HIGH RISK</span><span class="cblurb">One snap from the three for two points.</span></button>`;
      box.querySelector('[data-xp]').onclick = () => ACT.xp();
      box.querySelector('[data-two]').onclick = () => ACT.two();
    } else {
      label.textContent = 'TOUCHDOWN';
      box.innerHTML = `<div class="narrate">${offName()} is deciding: kick the extra point, or go for two.</div>`;
    }

  } else {
    label.textContent = '';
    box.innerHTML = '';
  }
}

/* ---------------- pre-snap play picker (offense only) ---------------- */

function buildPicker() {
  const pp = document.getElementById('playpicker');
  if (G.phase !== 'PRESNAP' || G.playChosen || !isOff()) { pp.classList.add('hidden'); return; }
  pp.classList.remove('hidden');
  pp.querySelector('.ppttl').textContent =
    G.isPAT ? `${offName()} — TWO-POINT TRY` : `${offName()} — CALL YOUR PLAY`;

  const cards = document.getElementById('ppcards');
  cards.innerHTML = PLAYS.map((_, i) => playCard(i, 'pp')).join('') + (canKick() ? fgCard('pp') : '');
  wireCards(cards);
}

/* ---------------- full-screen banners ---------------- */

function buildBanner() {
  const b = document.getElementById('banner');
  if (G.phase === 'BREAK' || G.phase === 'GAMEOVER') {
    b.classList.remove('hidden');
    b.innerHTML = `<h2>${G.message}</h2><p>${G.sub}</p><span class="hint">PRESS SPACE</span>`;
  } else {
    b.classList.add('hidden');
  }
}
