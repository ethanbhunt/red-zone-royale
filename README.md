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
| | `G` | line up a field goal (4th down only) |
| | `SPACE` | stop the kick meter |
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

**Kicks are a meter, not a dice roll.** Field goals and extra points put a
marker sweeping across a bar; hit `SPACE` (or click) when it's in the gold.
Longer kicks shrink the sweet spot and speed the marker up, and the ball
visibly sails wide of the uprights on a miss. Online, only the kicking team's
screen accepts the press; everyone else watches the same marker move.

Separation comes from **reaction time**: a defender in man coverage chases
where the receiver *was* a fraction of a second ago, so sharp route breaks get
people open and boosting a unit cuts its reaction time.

## Playing on two computers

Both players on the same Wi-Fi, one of you runs:

```
npm install     # once
npm start
```

It prints an address like `http://192.168.1.23:3000`. Open that on both
machines. The first browser to arrive is HOME (ball first), the second is
AWAY, and anyone after that just watches — put one on the projector.

Sides swap every possession, and each screen only shows the controls for
the side you are currently on. The defense does **not** see the offense's
route preview before the snap — online, reading the formation is their job.

How it works: `server.js` loads the exact same `config.js`, `engine.js`
and `game.js` the browser uses and runs the simulation there. Browsers
never simulate anything; they send intentions (`call play 2`, `snap`,
`throw to WR1`, `holding the rush key`) and draw whatever state the server
streams back. On a LAN the round trip is a couple of milliseconds, so no
prediction or interpolation is needed — that is the entire trick.

Hot-seat mode still works exactly as before: just open `index.html`.

## Rules

The whole game is the overtime shootout:

- **Round 1** — each team gets one possession from the 25. Touchdowns can be
  followed by a kicked extra point or a two-point try. Field goals allowed
  on fourth down.
- **Round 2** — same, but a touchdown *must* be followed by a two-point try.
- **Round 3+** — alternating two-point attempts only, one snap from the 3.

After both teams have had the ball in a round, whoever is ahead wins. Tied
means another round.

## Code layout

Plain scripts loaded in order, no bundler. The split is deliberate:

| File | Responsibility |
|---|---|
| `js/config.js` | Pure data: every tuning number, the four plays and their routes. Nothing here *does* anything. |
| `js/engine.js` | Simulates one play. Moves dots around and fills in a result. Knows nothing about scores or the DOM. |
| `js/game.js` | The rulebook: downs, scoring, overtime rounds. Decides what a play *meant*. |
| `js/render.js` | Draws state onto the canvas. Never modifies the game. |
| `js/hud.js` | The HTML around the canvas. Shared by both modes; every button goes through `ACT`, which the mode file fills in. |
| `js/main.js` | Hot-seat mode: input and the game loop, one keyboard. |
| `js/net.js` | Online mode: replaces `main.js`. Sends inputs to the server, draws what comes back. |
| `server.js` | Runs the game for two computers. Loads the same three logic files and ticks them at 60Hz. |

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
- `KICK_SWEET_*` / `KICK_SPEED_*` — how forgiving the kick meter is and how fast it moves, by distance

Adding a play is just another entry in `PLAYS`: a name, a blurb, and four
routes keyed `WR1`/`WR2`/`TE`/`RB`, given as `{d, l}` waypoints (`d` = yards downfield, `l` = yards
left/right of center).
