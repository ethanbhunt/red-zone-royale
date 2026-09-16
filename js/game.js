/* ============================================================
   GAME — the rulebook and the state machine.

   Phases:
     MENU -> PRESNAP -> LIVE -> RESULT -> (PRESNAP | PAT | BREAK)
                                       -> GAMEOVER

   Every rule about downs, scoring and overtime rounds lives
   here. The engine moves dots; this file decides what it meant.
   ============================================================ */

const G = {
  phase: 'MENU',
  teams: [
    { name: 'HOME', score: 0 },
    { name: 'AWAY', score: 0 },
  ],
  round: 1,
  firstPossessor: 0,       // who gets the ball first this round
  possIndex: 0,            // who has the ball right now
  possNumber: 0,           // 0 = first possession of the round, 1 = second
  down: 1,
  toGo: 10,
  ballX: CFG.START_YARD,
  isPAT: false,            // this snap is a 2-point conversion
  energy: CFG.ENERGY_POOL,
  boosts: { DL: false, LB: false, CB: false, S: false },
  play: null,
  selectedPlay: 0,
  message: '',
  sub: '',
};

/* Rounds 3 and up are the alternating 2-point shootout. */
function isShootoutRound() { return G.round >= 3; }

function offTeam() { return G.teams[G.possIndex]; }
function defTeam() { return G.teams[1 - G.possIndex]; }

/* ---------------- game / round / possession setup ---------------- */

function startGame(name0, name1) {
  G.teams[0] = { name: (name0 || 'HOME').toUpperCase(), score: 0 };
  G.teams[1] = { name: (name1 || 'AWAY').toUpperCase(), score: 0 };
  G.round = 1;
  G.firstPossessor = 0;
  startRound();
}

function startRound() {
  G.possNumber = 0;
  beginPossession(G.firstPossessor);
}

function beginPossession(teamIdx) {
  G.possIndex = teamIdx;
  G.energy = CFG.ENERGY_POOL;
  G.isPAT = isShootoutRound();
  G.ballX = G.isPAT ? CFG.PAT_YARD : CFG.START_YARD;
  G.down = 1;
  G.toGo = G.isPAT ? CFG.PAT_YARD : 10;

  if (isShootoutRound()) {
    G.message = `${offTeam().name} — 2-POINT ATTEMPT`;
    G.sub = 'One play. Score or it is over to them.';
  } else {
    G.message = `${offTeam().name} BALL`;
    G.sub = 'First and ten from the 25.';
  }
  toPresnap();
}

/* Build the formation and wait for the snap. */
function toPresnap() {
  G.phase = 'PRESNAP';
  G.play = startPlay(G.ballX, G.selectedPlay);
  clearBoosts();
}

function choosePlay(idx) {
  if (G.phase !== 'PRESNAP') return;
  G.selectedPlay = idx;
  G.play = startPlay(G.ballX, idx);
}

function snap() {
  if (G.phase !== 'PRESNAP') return;
  G.phase = 'LIVE';
  G.message = '';
  G.sub = '';
}

function clearBoosts() {
  G.boosts.DL = G.boosts.LB = G.boosts.CB = G.boosts.S = false;
}

/* ---------------- what just happened ---------------- */

function endPlay(result) {
  G.phase = 'RESULT';
  clearBoosts();

  /* --- 2-point conversion: one shot, no downs --- */
  if (G.isPAT) {
    if (result.type === 'TD') {
      addScore(2);
      G.message = 'CONVERSION GOOD';
      G.sub = `${offTeam().name} +2`;
    } else {
      G.message = 'NO GOOD';
      G.sub = 'Conversion failed.';
    }
    G.endsPossession = true;
    return;
  }

  /* --- touchdown --- */
  if (result.type === 'TD') {
    addScore(6);
    G.message = 'TOUCHDOWN';
    G.sub = `${offTeam().name} +6`;
    G.pendingPAT = true;
    G.endsPossession = false;
    return;
  }

  /* --- interception --- */
  if (result.type === 'INT') {
    G.message = 'INTERCEPTED';
    G.sub = `${defTeam().name} takes it away. No points.`;
    G.endsPossession = true;
    return;
  }

  /* --- normal play: move the ball, advance the down --- */
  const gain = Math.round(G.ballX - result.spot);
  G.ballX = Math.max(0.5, Math.min(40, result.spot));
  G.toGo -= gain;

  if (G.toGo <= 0) {
    G.down = 1;
    /* goal-to-go: never let this reach 0, or every snap reads "first down" */
    G.toGo = Math.max(1, Math.min(10, Math.ceil(G.ballX)));
    G.message = result.text;
    G.sub = `${gain >= 0 ? '+' : ''}${gain} yards · FIRST DOWN`;
  } else {
    G.down++;
    G.message = result.text;
    G.sub = `${gain >= 0 ? '+' : ''}${gain} yards · ` +
            (G.down > 4 ? 'TURNOVER ON DOWNS'
                        : `${ordinal(G.down)} & ${Math.ceil(G.toGo)}`);
  }

  G.endsPossession = (G.down > 4);
  if (G.endsPossession) G.sub = 'Turnover on downs. No points.';
}

function addScore(n) { G.teams[G.possIndex].score += n; }

/* ---------------- kicking ---------------- */

function fieldGoalChance() {
  const distance = G.ballX + 17;
  return Math.max(0.15, Math.min(0.98, 0.97 - Math.max(0, distance - 20) * 0.017));
}

function attemptFieldGoal() {
  const good = Math.random() < fieldGoalChance();
  const distance = Math.round(G.ballX + 17);
  G.phase = 'RESULT';
  if (good) {
    addScore(3);
    G.message = 'IT IS GOOD';
    G.sub = `${distance}-yard field goal · ${offTeam().name} +3`;
  } else {
    G.message = 'NO GOOD';
    G.sub = `${distance}-yard attempt sails wide.`;
  }
  G.endsPossession = true;
  G.play.result = { type: good ? 'FG' : 'FGMISS', text: good ? 'IT IS GOOD' : 'NO GOOD', yards: 0 };
}

function attemptExtraPoint() {
  const good = Math.random() < CFG.XP_MAKE;
  G.phase = 'RESULT';
  if (good) { addScore(1); G.message = 'EXTRA POINT GOOD'; G.sub = `${offTeam().name} +1`; }
  else { G.message = 'EXTRA POINT MISSED'; G.sub = 'It hooks left.'; }
  G.pendingPAT = false;
  G.endsPossession = true;
  G.play.result = { type: 'XP', text: G.message, yards: 0 };
}

/* Go for two: a single snap from the 3. */
function goForTwo() {
  G.pendingPAT = false;
  G.isPAT = true;
  G.ballX = CFG.PAT_YARD;
  G.down = 1;
  G.toGo = CFG.PAT_YARD;
  G.energy = CFG.ENERGY_POOL;
  G.message = 'GOING FOR TWO';
  G.sub = 'One snap from the three.';
  toPresnap();
}

/* ---------------- moving the game forward ---------------- */

/* Called when the player acknowledges the result screen. */
function advance() {
  /* A touchdown owes us a conversion first. */
  if (G.pendingPAT) {
    if (G.round === 1) { G.phase = 'PAT_CHOICE'; return; }
    goForTwo();                        // round 2+: two-point try is mandatory
    return;
  }

  if (G.endsPossession) { finishPossession(); return; }
  toPresnap();
}

function finishPossession() {
  G.endsPossession = false;

  if (G.possNumber === 0) {
    G.possNumber = 1;
    beginPossession(1 - G.possIndex);
    return;
  }

  /* Both teams have had the ball. Somebody ahead? Game over. */
  if (G.teams[0].score !== G.teams[1].score) {
    G.phase = 'GAMEOVER';
    const w = G.teams[0].score > G.teams[1].score ? G.teams[0] : G.teams[1];
    G.message = `${w.name} WINS`;
    G.sub = `${G.teams[0].score} – ${G.teams[1].score} after ${G.round} round${G.round > 1 ? 's' : ''}`;
    return;
  }

  G.round++;
  G.firstPossessor = 1 - G.firstPossessor;
  G.phase = 'BREAK';
  G.message = `ROUND ${G.round}`;
  G.sub = isShootoutRound()
    ? 'Alternating two-point attempts. First stop wins it.'
    : 'Touchdowns must be followed by a two-point try.';
}

function ordinal(n) { return ['', '1ST', '2ND', '3RD', '4TH'][n] || `${n}TH`; }
