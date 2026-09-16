# Red Zone Royale

A two-player, same-keyboard football game played entirely under college
overtime rules. No install, no build step — open `index.html` in a browser.

## Controls

Both players use the keyboard at the same time. Defense takes the left hand,
offense takes the right.

| | Keys | What it does |
|---|---|---|
| **Offense** | `1` `2` `3` `4` | pick a play |
| | `SPACE` | snap the ball |
| | `J` `K` `L` `;` | throw to WR1 / WR2 / TE / RB |
| | `G` | attempt a field goal (4th down only) |
| **Defense** | `A` | hold to boost the pass rush |
| | `S` | hold to boost the linebackers |
| | `D` | hold to boost the cornerbacks |
| | `F` | hold to boost the safeties |

## How it plays

The offense snaps, then **decides when to throw**. Waiting lets routes develop
downfield, but the pass rush is closing the whole time — a ring tightens around
your quarterback and turns red just before you eat a sack.

The defense has **one energy pool per possession**, drained continuously while
a unit key is held. Every point poured into the rush is a point not covering
the deep post, so you are always choosing. Energy refills each possession, and
unspent energy carries across downs within a drive — so you can save it for
fourth down.

The running back lines up beside the quarterback and holds in the backfield
for a beat before releasing into his route. Press `;` while he's still behind
the line and it's a **handoff** (or a **pitch** if he's started moving) — it
can't be dropped or picked, and the offensive line holds the front seven off
him for about a second. Pouring energy into the rush cuts that window in half,
which is how the defense stuffs a run.

Separation comes from **reaction time**: a defender in man coverage chases
where the receiver *was* a fraction of a second ago, so sharp route breaks get
people open and boosting a unit cuts its reaction time.

## Rules

The whole game is the overtime shootout:

- **Round 1** — each team gets one possession from the 25. Touchdowns can be
  followed by a kicked extra point or a two-point try. Field goals allowed.
- **Round 2** — same, but a touchdown *must* be followed by a two-point try.
- **Round 3+** — alternating two-point attempts only, one snap from the 3.

After both teams have had the ball in a round, whoever is ahead wins. Tied
means another round.

## Code layout

Five files, loaded in order, no bundler. The split is deliberate:

| File | Responsibility |
|---|---|
| `js/config.js` | Pure data: every tuning number, the four plays and their routes. Nothing here *does* anything. |
| `js/engine.js` | Simulates one play. Moves dots around and fills in a result. Knows nothing about scores or the DOM. |
| `js/game.js` | The rulebook: downs, scoring, overtime rounds. Decides what a play *meant*. |
| `js/render.js` | Draws state onto the canvas. Never modifies the game. |
| `js/main.js` | Input, the game loop, and the HTML scoreboard/HUD. |

The loop in `main.js` is the classic three steps, sixty times a second:
read input → update state → draw state.

### Tuning it

Everything balance-related is a constant at the top of `js/config.js`.
Useful knobs:

- `SPD_DL` / `BLOCK_*` — how fast the rush gets home (the offense's clock)
- `ENERGY_POOL` / `ENERGY_DRAIN` — how much defense you get per possession
- `BOOST_DL` / `BOOST_COV` / `COVER_LAG` — how much a held key actually matters
- `CATCH_*` — the completion curve as a function of separation
- `RUN_BLOCK` / `TACKLE_PROB` / `CUT_LOOKAHEAD` — how long the line holds, how often contact brings a runner down, and how sharply he cuts
- `TEMPO` — global slow-motion dial for the whole play (1.0 = real time)

Adding a play is just another entry in `PLAYS`: a name, a blurb, and four
routes keyed `WR1`/`WR2`/`TE`/`RB`, given as `{d, l}` waypoints (`d` = yards downfield, `l` = yards
left/right of center).
