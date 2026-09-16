/* ============================================================
   ENGINE — simulates one football play.

   The whole thing is two functions:
     startPlay()  builds the players and their routes
     updatePlay() advances everything by dt seconds

   updatePlay() knows nothing about scores, downs or the DOM.
   It just moves dots around and eventually fills in P.result.
   That separation is the point: you can reason about the rules
   without thinking about pixels.
   ============================================================ */

/* ---------- tiny vector helpers ---------- */
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/* Move an entity `amount` yards straight toward a point. */
function moveToward(e, tx, ty, amount) {
  const dx = tx - e.x, dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return;
  const step = Math.min(amount, d);
  e.x += (dx / d) * step;
  e.y += (dy / d) * step;
}

/* Move an entity `amount` yards along its route. Once the route
   runs out they keep sprinting in the last direction they were
   heading, which is what a receiver actually does. */
function moveAlongPath(e, amount) {
  while (amount > 1e-6) {
    if (e.seg >= e.path.length) {
      /* Route is finished — turn upfield and run at the end zone.
         Sprinting on in the last direction would carry a crossing
         route straight out of bounds and pin him on the sideline. */
      e.dir = { x: -1, y: 0 };
      e.x += e.dir.x * amount;
      return;
    }
    const p = e.path[e.seg];
    const d = dist(e.x, e.y, p.x, p.y);
    if (d <= amount) {                            // reached this waypoint
      e.x = p.x; e.y = p.y;
      amount -= d;
      e.seg++;
      const n = e.path[e.seg];
      if (n) {
        const nd = dist(e.x, e.y, n.x, n.y) || 1;
        e.dir = { x: (n.x - e.x) / nd, y: (n.y - e.y) / nd };
      }
    } else {
      const dx = (p.x - e.x) / d, dy = (p.y - e.y) / d;
      e.dir = { x: dx, y: dy };
      e.x += dx * amount; e.y += dy * amount;
      return;
    }
  }
}

/* Keep anyone carrying or catching the ball inside the white lines.
   Routes clamp their waypoints, but a receiver who runs out of route
   keeps sprinting in his last direction forever — straight off the field. */
function clampToField(e) {
  const edge = CFG.SIDELINE;
  if (e.y < -edge) e.y = -edge;
  if (e.y >  edge) e.y =  edge;
  if (e.x < CFG.BACKLINE) e.x = CFG.BACKLINE;
}

/* A short trail of where an entity has been. Man coverage chases the
   receiver's position from COVER_LAG seconds ago, which is what lets a
   sharp cut create separation — the defender keeps running to where you
   were. Remove this and no receiver is ever open. */
function recordHistory(e, t) {
  e.hist.push({ t, x: e.x, y: e.y });
  if (e.hist.length > 80) e.hist.shift();
}
function pastPos(e, t) {
  const h = e.hist;
  for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i];
  return h[0];
}

/* Turn a route (downfield/lateral offsets) into world points. */
function buildPath(losX, route) {
  return route.map(pt => ({
    x: losX - pt.d,
    y: Math.max(-CFG.MAX_LATERAL, Math.min(CFG.MAX_LATERAL, pt.l)),
  }));
}

/* ============================================================
   START A PLAY
   ============================================================ */
function startPlay(losX, playIdx) {
  const play = PLAYS[playIdx];

  /* --- receivers --- */
  const recs = TARGETS.map(t => {
    const path = buildPath(losX, play.routes[t.id]);
    const start = path[0];
    const next = path[1] || start;
    const d = dist(start.x, start.y, next.x, next.y) || 1;
    return {
      id: t.id, label: t.label, name: t.name, short: t.short,
      x: start.x, y: start.y,
      path, seg: 1,
      dir: { x: (next.x - start.x) / d, y: (next.y - start.y) / d },
      speed: t.speed,
      hold: t.hold || 0,               // seconds he waits before releasing
      hist: [{ t: 0, x: start.x, y: start.y }],
    };
  });

  /* --- defenders ---
     `assign` is an index into recs for man coverage, or a string
     for the rushers and the deep safeties. */
  const defs = [
    { unit:'DL', x: losX - 0.4, y: -4.5, assign:'QB', speed: CFG.SPD_DL },
    { unit:'DL', x: losX - 0.4, y: -1.5, assign:'QB', speed: CFG.SPD_DL },
    { unit:'DL', x: losX - 0.4, y:  1.5, assign:'QB', speed: CFG.SPD_DL },
    { unit:'DL', x: losX - 0.4, y:  4.5, assign:'QB', speed: CFG.SPD_DL },

    { unit:'CB', x: losX - 6.0, y:-12.0, assign:0, speed: CFG.SPD_CB },
    { unit:'CB', x: losX - 6.0, y: 12.0, assign:1, speed: CFG.SPD_CB },
    { unit:'CB', x: losX - 7.5, y:  6.5, assign:2, speed: CFG.SPD_CB },

    { unit:'LB', x: losX - 5.0, y: -3.0, assign:3, speed: CFG.SPD_LB },
    { unit:'LB', x: losX - 5.5, y:  1.5, assign:'SPY', speed: CFG.SPD_LB },

    { unit:'S',  x: losX - 13.0, y: -7.0, assign:'DEEP_L', speed: CFG.SPD_S },
    { unit:'S',  x: losX - 13.0, y:  7.0, assign:'DEEP_R', speed: CFG.SPD_S },
  ];

  /* --- offensive line (decorative, they just hold their ground) --- */
  const oline = [-3.4, -1.7, 0, 1.7, 3.4].map(y => ({ x: losX + 0.9, y }));

  for (const d of defs) d.beatenUntil = 0;

  return {
    t: 0,
    phase: 'LIVE',              // LIVE -> FLIGHT -> YAC -> OVER
    losX,
    playIdx,
    play,
    qb: { x: losX + 3.5, y: 0 },
    dropTarget: { x: losX + 7.0, y: (play.rollout || 0) },
    recs, defs, oline,
    ball: null,
    targetIdx: -1,
    carrier: null,
    pressure: 0,                // 0..1, how close the rush is
    result: null,
    flash: null,                // short-lived text drawn on the field
  };
}

/* ============================================================
   ONE FRAME OF A PLAY
   input = { throwAt: index|-1, boosts: {DL,LB,CB,S} }
   ============================================================ */
function updatePlay(P, dt, input) {
  if (P.phase === 'OVER') return;
  P.t += dt;

  const boosts = input.boosts || {};
  const spd = u => (boosts[u] ? (u === 'DL' ? CFG.BOOST_DL : CFG.BOOST_COV) : 1);

  /* ---------- 1. the quarterback ---------- */
  if (P.phase === 'LIVE') {
    moveToward(P.qb, P.dropTarget.x, P.dropTarget.y, 7.0 * dt);
  }

  /* ---------- 2. receivers run their routes ---------- */
  for (const r of P.recs) {
    if (P.carrier === r) continue;              // ballcarrier is handled below
    if (P.t >= r.hold) moveAlongPath(r, r.speed * dt);   // RB waits for a beat
    clampToField(r);
    recordHistory(r, P.t);
  }

  /* After a handoff the offensive line ties the rushers up for a moment.
     Pouring energy into the rush cuts that window in half. */
  const isBlocked = () => P.exchangeT !== undefined &&
    (P.t - P.exchangeT) < (boosts.DL ? CFG.RUN_BLOCK_BOOSTED : CFG.RUN_BLOCK);

  if (P.flash) { P.flash.t -= dt; if (P.flash.t <= 0) P.flash = null; }

  /* ---------- 3. defenders ---------- */
  /* How much the offensive line is still holding up. Starts as a
     hard block and decays to nothing — that decay is your clock. */
  let block = CFG.BLOCK_EARLY;
  if (P.t > CFG.BLOCK_T0) {
    const f = Math.min(1, (P.t - CFG.BLOCK_T0) / (CFG.BLOCK_T1 - CFG.BLOCK_T0));
    block = CFG.BLOCK_EARLY + (1 - CFG.BLOCK_EARLY) * f;
  }
  if (P.t < 0.9) block *= P.play.paRush;        // play action fake

  /* Once the ball is in someone's hands, all eleven turn into pursuers. */
  const chaseTarget = (P.phase === 'YAC') ? P.carrier : null;

  for (const d of P.defs) {
    const s = d.speed * spd(d.unit) * dt;

    if (chaseTarget) {
      let pace = CFG.PURSUE[d.unit] * spd(d.unit);
      if (isBlocked() && (d.unit === 'DL' || d.unit === 'LB')) {
        pace *= 0.35;   // the line is on the DL and climbing to the LBs
      }
      /* defensive backs are covering somebody; it takes them a moment to
         recognise the run and come up */
      if ((d.unit === 'CB' || d.unit === 'S') && P.exchangeT !== undefined &&
          P.t - P.exchangeT < CFG.DB_READ) pace *= 0.4;
      const gap  = dist(d.x, d.y, chaseTarget.x, chaseTarget.y);
      /* If we are TRAILING the runner (further from the goal than he is)
         we cut an angle at where he is headed. If we are already goal-side
         of him we attack him head-on — leading from in front just means
         backpedalling toward our own end zone and never tackling anyone. */
      const lead = (d.x > chaseTarget.x) ? Math.min(1.2, gap / pace) : 0;
      moveToward(d,
        chaseTarget.x - chaseTarget.speed * lead,
        chaseTarget.y * 0.9,
        pace * dt);
      continue;
    }

    if (d.assign === 'QB') {
      moveToward(d, P.qb.x, P.qb.y, s * block);
    } else if (d.assign === 'SPY') {
      /* short middle zone, drifts under the shallowest crosser */
      moveToward(d, P.losX - 7, P.qb.y * 0.4, s * 0.8);
    } else if (d.assign === 'DEEP_L' || d.assign === 'DEEP_R') {
      const side = d.assign === 'DEEP_L' ? -1 : 1;
      /* find the deepest receiver on my half of the field */
      let best = null;
      for (const r of P.recs) {
        if (Math.sign(r.y) !== side && Math.abs(r.y) > 2) continue;
        if (!best || r.x < best.x) best = r;
      }
      if (best && (P.losX - best.x) > 8) {
        /* he has gotten deep — leave the zone and go take him away */
        const lag = CFG.COVER_LAG * (boosts.S ? CFG.COVER_LAG_BOOST : 1);
        const ghost = pastPos(best, P.t - lag);
        moveToward(d, ghost.x, ghost.y, s);
      } else {
        /* nothing deep yet — hold the top of the coverage */
        moveToward(d, P.losX - 14, side * 7, s);
      }
    } else {
      const r = P.recs[d.assign];
      if (P.t < r.hold) {
        /* my man is still in the backfield: hold my spot and read */
        moveToward(d, P.losX - 5, d.y, s * 0.4);
      } else {
        /* man coverage, chasing a stale position */
        const lag = CFG.COVER_LAG * (boosts[d.unit] ? CFG.COVER_LAG_BOOST : 1);
        const ghost = pastPos(r, P.t - lag);
        moveToward(d, ghost.x, ghost.y, s);
      }
    }
  }

  for (const d of P.defs) clampToField(d);

  /* pressure meter for the HUD */
  let closest = 99;
  for (const d of P.defs) {
    if (d.assign === 'QB') closest = Math.min(closest, dist(d.x, d.y, P.qb.x, P.qb.y));
  }
  P.pressure = Math.max(0, Math.min(1, 1 - (closest - CFG.SACK_DIST) / 6));

  /* ---------- 4. the throw ---------- */
  if (P.phase === 'LIVE') {
    if (input.throwAt >= 0) {
      throwBall(P, input.throwAt);
    } else if (closest <= CFG.SACK_DIST) {
      return finish(P, 'SACK', P.qb.x + CFG.SACK_LOSS, 'SACKED!');
    } else if (P.t > CFG.MAX_HOLD) {
      return finish(P, 'SACK', P.qb.x + CFG.SACK_LOSS, 'COVERAGE SACK!');
    }
  }

  /* ---------- 5. ball in the air ---------- */
  if (P.phase === 'FLIGHT') {
    const b = P.ball;
    b.t += dt;
    const r = P.recs[P.targetIdx];
    const k = Math.min(1, b.t / b.dur);
    b.x = b.fromX + (r.x - b.fromX) * k;        // ball homes in on the receiver
    b.y = b.fromY + (r.y - b.fromY) * k;
    b.arc = Math.sin(k * Math.PI);              // used for the shadow/height

    if (k >= 1) resolveCatch(P, r);
  }

  /* ---------- 6. run after catch ---------- */
  if (P.phase === 'YAC') {
    const c = P.carrier;
    /* Run to daylight: head for the end zone, but veer away from any
       defender closing in from in front. Defenders behind us are ignored;
       either we outrun them or we do not. */
    let push = 0;
    for (const d of P.defs) {
      if (d.x > c.x + 1) continue;
      const dx = d.x - c.x, dy = d.y - c.y;
      const dd = Math.hypot(dx, dy);
      if (dd >= CFG.DAYLIGHT || dd < 0.01) continue;
      /* a defender dead ahead gives no lateral signal — cut toward the
         side of the field with more room */
      const side = Math.abs(dy) < 0.6 ? (c.y > 0 ? -1 : 1) : -Math.sign(dy);
      push += side * (CFG.DAYLIGHT - dd);
    }
    const aimY = Math.max(-CFG.SIDELINE + 1, Math.min(CFG.SIDELINE - 1,
                   c.y * 0.97 + push * 1.6));
    moveToward(c, c.x - CFG.CUT_LOOKAHEAD, aimY, c.speed * dt);
    clampToField(c);
    P.ball.x = c.x; P.ball.y = c.y; P.ball.arc = 0;

    if (c.x <= 0) return finish(P, 'TD', c.x, 'TOUCHDOWN!');

    for (const d of P.defs) {
      if (d.unit === 'DL' && isBlocked()) continue;    // tied up by the line
      if (d.beatenUntil > P.t) continue;               // already whiffed
      if (dist(d.x, d.y, c.x, c.y) <= CFG.TACKLE_DIST) {
        /* Contact. Most of the time he goes down; sometimes he shrugs it
           off, and that defender is out of the play for a moment. This is
           where broken tackles and long runs come from. */
        let p = boosts[d.unit] ? CFG.TACKLE_PROB_BOOSTED : CFG.TACKLE_PROB;
        if (d.unit === 'LB' && isBlocked()) p *= 0.6;   // shedding a block
        if (Math.random() < p) return finish(P, 'TACKLE', c.x, 'TACKLED');
        d.beatenUntil = P.t + CFG.BEATEN_FOR;
        P.flash = { text: 'BROKE IT', t: 0.7 };
      }
    }
  }

  /* ---------- 7. interception return ---------- */
  if (P.phase === 'INT_RUN') {
    P.intT += dt;
    const d = P.carrier;
    d.x += 9 * dt;
    P.ball.x = d.x; P.ball.y = d.y;
    if (P.intT > 0.9) return finish(P, 'INT', P.losX, 'INTERCEPTED!');
  }
}

/* ---------- release the ball ---------- */
function throwBall(P, idx) {
  const r = P.recs[idx];

  /* Still behind the line? That is not a pass, it is an exchange:
     no drop, no interception, he is simply the ballcarrier now. */
  if (r.hold && r.x > P.losX - 0.5) {
    P.targetIdx = idx;
    P.phase = 'YAC';
    P.carrier = r;
    P.exchangeT = P.t;
    P.ball = { x: r.x, y: r.y, arc: 0, airYards: 0 };
    P.flash = { text: P.t < r.hold ? 'HANDOFF' : 'PITCH', t: 0.9 };
    return;
  }

  const d = dist(P.qb.x, P.qb.y, r.x, r.y);
  P.targetIdx = idx;
  P.phase = 'FLIGHT';
  P.ball = {
    fromX: P.qb.x, fromY: P.qb.y,
    x: P.qb.x, y: P.qb.y,
    t: 0, dur: Math.max(0.22, d / CFG.SPD_BALL), arc: 0,
    airYards: d,
  };
}

/* ---------- did he catch it? ---------- */
function resolveCatch(P, r) {
  /* separation = how far the nearest defender is from the catch point */
  let sep = 99, nearest = null;
  for (const d of P.defs) {
    const dd = dist(d.x, d.y, r.x, r.y);
    if (dd < sep) { sep = dd; nearest = d; }
  }

  let pct = CFG.CATCH_BASE + sep * CFG.CATCH_PER_YD - P.ball.airYards * CFG.CATCH_DEPTH_PEN;
  pct = Math.max(0.04, Math.min(CFG.CATCH_MAX, pct));
  P.lastOdds = { sep, pct };

  if (Math.random() < pct) {
    P.phase = 'YAC';
    P.carrier = r;
    P.flash = { text: 'CAUGHT', t: 0.8 };
    return;
  }

  /* incomplete — but a defender draped all over it might pick it */
  if (sep < CFG.INT_WINDOW && nearest && nearest.unit !== 'DL') {
    const intChance = (1 - sep / CFG.INT_WINDOW) * CFG.INT_MAX;
    if (Math.random() < intChance) {
      P.phase = 'INT_RUN';
      P.carrier = nearest;
      P.intT = 0;
      P.ball = { x: nearest.x, y: nearest.y, arc: 0 };
      return;
    }
  }
  finish(P, 'INCOMPLETE', P.losX, 'INCOMPLETE');
}

/* ---------- wrap the play up ---------- */
function finish(P, type, spotX, text) {
  P.phase = 'OVER';
  const spot = Math.max(-0.5, spotX);
  P.result = {
    type,
    spot,
    yards: Math.round(P.losX - spot),
    text,
    odds: P.lastOdds || null,
  };
}
