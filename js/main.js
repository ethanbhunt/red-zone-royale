/* ============================================================
   MAIN — hot-seat mode: one keyboard, two players side by side.

   Input, the game loop, and the glue that lets the HUD drive the
   rulebook directly. The loop is the classic three steps, sixty
   times a second:
       read input  ->  update state  ->  draw state

   For the two-computer version see net.js, which replaces this file.
   ============================================================ */

const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');

const held = {};            // which keys are currently down
let pendingThrow = -1;      // set by a keypress, consumed by the next update
let resultHandled = false;

VIEW.role = 'both';         // this screen is both players

/* The HUD's buttons call these. Here they just call the rulebook. */
Object.assign(ACT, {
  choosePlay: i => choosePlay(i),
  snap:       () => snap(),
  fieldGoal:  () => attemptFieldGoal(),
  throwTo:    i => { pendingThrow = i; },
  xp:         () => attemptExtraPoint(),
  two:        () => goForTwo(),
  kick:       () => stopKick(),
  advance:    () => { advance(); resultHandled = false; },
  nextRound:  () => startRound(),
  restart:    () => location.reload(),
});

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
      if (k >= '1' && k <= '4') ACT.choosePlay(+k - 1);
      else if (k === 'g' && canKick()) ACT.fieldGoal();
      else if (k === ' ') ACT.snap();   // no-ops until a play has been called
      break;

    case 'LIVE': {
      const i = TARGETS.findIndex(t => t.key === k);
      if (i >= 0) ACT.throwTo(i);
      break;
    }

    case 'KICK':
      if (k === ' ') ACT.kick();
      break;

    case 'RESULT':
      if (k === ' ') ACT.advance();
      break;

    case 'PAT_CHOICE':
      if (k === '1') ACT.xp();
      else if (k === '2') ACT.two();
      break;

    case 'BREAK':
      if (k === ' ') ACT.nextRound();
      break;

    case 'GAMEOVER':
      if (k === ' ') ACT.restart();
      break;
  }
});

document.addEventListener('keyup', e => { held[e.key.toLowerCase()] = false; });
canvas.addEventListener('click', () => { if (G.phase === 'KICK') ACT.kick(); });

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

  /* the kick meter is a reaction test, so it runs on the real clock */
  if (G.phase === 'KICK') tickKick(dt);

  render(ctx, G);
  syncUI();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
