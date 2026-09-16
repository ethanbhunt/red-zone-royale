/* ============================================================
   RENDER — draws the world onto the canvas.

   This file NEVER changes the game. It only reads state and
   paints it. If you deleted this file the game would still run
   perfectly; you just could not see it.
   ============================================================ */

/* world yards -> screen pixels */
function sx(x) { return (CFG.VIEW_FAR - x) * CFG.PPY; }
function sy(y) { return CFG.CANVAS_H / 2 + y * CFG.PPY; }

function render(ctx, G) {
  ctx.clearRect(0, 0, CFG.CANVAS_W, CFG.CANVAS_H);
  drawField(ctx, G);

  const P = G.play;
  if (!P) return;

  /* Route preview before the snap. Online, the defense does not get to
     see it — reading the formation is their job. (VIEW comes from hud.js;
     guard it so this file still works without the HUD, e.g. in tests.) */
  if (G.phase === 'PRESNAP' && (typeof VIEW === 'undefined' || VIEW.role !== 'def')) drawRoutes(ctx, P);
  drawLines(ctx, G, P);
  drawPlayers(ctx, G, P);
  drawBall(ctx, P);
  drawOverlay(ctx, G, P);
}

/* ---------------- field ---------------- */
function drawField(ctx, G) {
  const defColor = TEAM_COLORS[1 - G.possIndex];

  /* grass, in five-yard bands */
  for (let x = -10; x < 46; x += 5) {
    ctx.fillStyle = ((x / 5) % 2 === 0) ? '#1d7a40' : '#218a48';
    const x0 = sx(x + 5), x1 = sx(x);
    ctx.fillRect(x0, 0, x1 - x0, CFG.CANVAS_H);
  }

  /* behind the back of the end zone — out of the world */
  ctx.fillStyle = '#0c1016';
  ctx.fillRect(0, 0, CFG.CANVAS_W, CFG.CANVAS_H);
  ctx.fillStyle = '#1d7a40';
  ctx.fillRect(sx(46), 0, sx(-10) - sx(46), CFG.CANVAS_H);
  for (let x = -10; x < 46; x += 5) {
    ctx.fillStyle = ((x / 5) % 2 === 0) ? '#1d7a40' : '#218a48';
    const x0 = Math.max(sx(x + 5), 0), x1 = sx(x);
    ctx.fillRect(x0, 0, x1 - x0, CFG.CANVAS_H);
  }

  /* end zone */
  ctx.fillStyle = defColor;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(sx(0), 0, sx(-10) - sx(0), CFG.CANVAS_H);
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(sx(-5), CFG.CANVAS_H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '700 30px Arial Black, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(G.teams[1 - G.possIndex].name.toUpperCase(), 0, 0);
  ctx.restore();

  /* yard lines + hashes */
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 45; x += 5) {
    ctx.beginPath();
    ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), CFG.CANVAS_H);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 45; x += 1) {
    if (x % 5 === 0) continue;
    for (const hy of [-8, 8]) {
      ctx.beginPath();
      ctx.moveTo(sx(x), sy(hy) - 4); ctx.lineTo(sx(x), sy(hy) + 4);
      ctx.stroke();
    }
  }

  /* goal line */
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), CFG.CANVAS_H); ctx.stroke();

  /* yard numbers */
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '700 22px Arial Black, Arial, sans-serif';
  ctx.textAlign = 'center';
  for (let x = 10; x <= 40; x += 10) {
    ctx.fillText(String(x), sx(x), 40);
    ctx.fillText(String(x), sx(x), CFG.CANVAS_H - 26);
  }
}

/* ---------------- scrimmage + first down markers ---------------- */
function drawLines(ctx, G, P) {
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(40,90,220,0.85)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(sx(P.losX), 0); ctx.lineTo(sx(P.losX), CFG.CANVAS_H); ctx.stroke();

  if (!G.isPAT) {
    const fd = P.losX - G.toGo;
    if (fd > 0) {
      ctx.strokeStyle = 'rgba(245,205,40,0.95)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx(fd), 0); ctx.lineTo(sx(fd), CFG.CANVAS_H); ctx.stroke();
    }
  }
}

/* ---------------- pre-snap route preview ---------------- */
function drawRoutes(ctx, P) {
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  for (const r of P.recs) {
    ctx.beginPath();
    ctx.moveTo(sx(r.path[0].x), sy(r.path[0].y));
    for (let i = 1; i < r.path.length; i++) ctx.lineTo(sx(r.path[i].x), sy(r.path[i].y));
    ctx.stroke();

    const end = r.path[r.path.length - 1];
    ctx.setLineDash([]);
    keyBadge(ctx, sx(end.x), sy(end.y), r.label);
    ctx.setLineDash([6, 6]);
  }
  ctx.setLineDash([]);
}

/* ---------------- players ---------------- */
function drawPlayers(ctx, G, P) {
  const off = TEAM_COLORS[G.possIndex];
  const def = TEAM_COLORS[1 - G.possIndex];

  for (const o of P.oline) chip(ctx, sx(o.x), sy(o.y), 8, '#8d9aa5', '');

  for (const d of P.defs) {
    const boosted = G.boosts && G.boosts[d.unit] && G.energy > 0;
    chip(ctx, sx(d.x), sy(d.y), 9, def, d.unit === 'DL' ? '' : d.unit,
         boosted ? 'rgba(245,205,40,0.5)' : false);
  }

  for (const r of P.recs) {
    const isTarget = P.carrier === r;
    chip(ctx, sx(r.x), sy(r.y), 9, off, r.short, isTarget);
    if (G.phase === 'LIVE' && P.phase === 'LIVE') {
      keyBadge(ctx, sx(r.x), sy(r.y) - 22, r.label);
    }
  }

  /* quarterback gets a white ring so you can always find him */
  chip(ctx, sx(P.qb.x), sy(P.qb.y), 10, off, 'QB', P.phase === 'LIVE');
}

/* `glow` is either falsy, true (a plain white halo) or a colour string. */
function chip(ctx, x, y, r, color, label, glow) {
  if (glow) {
    const c = (typeof glow === 'string') ? glow : 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.arc(x, y, r + 9, 0, 7);
    ctx.fillStyle = c; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r + 9, 0, 7);
    ctx.lineWidth = 2; ctx.strokeStyle = c.replace(/0\.\d+\)$/, '0.95)'); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = '700 9px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
  }
}

function keyBadge(ctx, x, y, label) {
  ctx.fillStyle = 'rgba(12,16,22,0.9)';
  roundRect(ctx, x - 11, y - 11, 22, 22, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '700 13px Arial Black, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 1);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- ball ---------------- */
function drawBall(ctx, P) {
  if (!P.ball) return;
  const b = P.ball;
  const lift = (b.arc || 0) * 16;

  ctx.beginPath();
  ctx.ellipse(sx(b.x), sy(b.y), 5, 3, 0, 0, 7);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();

  ctx.beginPath();
  ctx.ellipse(sx(b.x), sy(b.y) - lift, 6, 4, -0.4, 0, 7);
  ctx.fillStyle = '#8a4b1e'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
}

/* ---------------- on-field text ---------------- */
function drawOverlay(ctx, G, P) {
  /* Pass-rush pressure, drawn as a ring closing in on the quarterback.
     When it goes solid red you are about to eat a sack. */
  if (G.phase === 'LIVE' && P.phase === 'LIVE' && P.pressure > 0.02) {
    const x = sx(P.qb.x), y = sy(P.qb.y);
    const hot = P.pressure > 0.72;
    ctx.beginPath();
    ctx.arc(x, y, 16 + (1 - P.pressure) * 26, 0, 7);
    ctx.lineWidth = 2 + P.pressure * 3;
    ctx.strokeStyle = hot ? 'rgba(255,70,70,0.95)' : `rgba(255,210,77,${0.35 + P.pressure * 0.5})`;
    ctx.stroke();
    if (hot) {
      ctx.fillStyle = 'rgba(255,70,70,0.95)';
      ctx.font = '700 12px Arial Black, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PRESSURE', x, y - 30);
    }
  }

  if (P.flash && P.carrier) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, P.flash.t * 1.8)})`;
    ctx.font = '700 13px Arial Black, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(P.flash.text, sx(P.carrier.x), sy(P.carrier.y) - 24);
  }

  if (P.result) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, CFG.CANVAS_H / 2 - 44, CFG.CANVAS_W, 88);
    ctx.fillStyle = '#fff';
    ctx.font = '700 40px Arial Black, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(P.result.text, CFG.CANVAS_W / 2, CFG.CANVAS_H / 2 - 12);

    let sub = '';
    if (P.result.type === 'TACKLE') sub = `${P.result.yards >= 0 ? '+' : ''}${P.result.yards} YARDS`;
    else if (P.result.type === 'SACK') sub = `${P.result.yards} YARDS`;
    else if (P.result.type === 'TD') sub = `${G.teams[G.possIndex].name.toUpperCase()} SCORES`;
    if (P.result.odds && (P.result.type === 'INCOMPLETE' || P.result.type === 'INT')) {
      sub = `${(P.result.odds.sep).toFixed(1)} YDS OF SEPARATION · ${Math.round(P.result.odds.pct * 100)}% CATCH`;
    }
    if (sub) {
      ctx.font = '700 16px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(sub, CFG.CANVAS_W / 2, CFG.CANVAS_H / 2 + 24);
    }
  }
}
