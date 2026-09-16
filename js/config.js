/* ============================================================
   CONFIG — every number you might want to tweak lives here.
   Nothing in this file does anything; it is pure data.
   ============================================================ */

const CFG = {
  /* ---- view / camera ----------------------------------------
     World units are YARDS.
       x = distance from the offense's target goal line.
           BIG x = far from scoring, x = 0 is the goal line,
           negative x is inside the end zone.
           So the offense always moves toward SMALLER x.
       y = across the field. 0 is the middle, +y is toward the
           bottom of the screen.
     The camera never moves: we just show x from -10.6 to 42,
     which is enough for every situation in this game.        */
  PPY: 19,            // pixels per yard
  VIEW_FAR: 38,       // world x drawn at the left edge of canvas
  CANVAS_W: 1000,
  CANVAS_H: 560,
  MAX_LATERAL: 13,    // routes get clamped here so nobody runs off-screen
  SIDELINE: 13.8,     // hard edge of the world — nobody goes past this
  BACKLINE: -8.5,     // back of the end zone. Matters on 2-point tries, where
                      // a deep route would otherwise run clean off the field.

  /* ---- game rules ---- */
  START_YARD: 25,     // every drive starts at the 25
  PAT_YARD: 3,        // 2-pt conversions & extra points snap from the 3
  ENERGY_POOL: 100,   // defense energy, refilled each possession
  ENERGY_DRAIN: 15,   // energy per simulation-second while holding a unit key
  BOOST_DL: 1.90,     // rush gets a big multiplier: it is the defense's clock
  BOOST_COV: 1.18,    // coverage gets a smaller one
  COVER_LAG: 0.20,    // seconds a man defender trails the receiver.
                      // THIS is where separation comes from: the defender
                      // chases where you WERE, so sharp cuts break him off.
  COVER_LAG_BOOST: 0.45, // boosting a unit cuts its reaction time by this much.
                      // This, not BOOST_COV, is what really decides whether a
                      // covered receiver is catchable. Raise it to make the
                      // defense's boost gentler, lower it to make it brutal.

  /* ---- pace ----
     A single global slow-motion dial. Every speed, the blocking ramp
     and the ball flight all read from the same simulation clock, so
     turning this down slows the whole play without disturbing any of
     the balance between the pieces. 1.0 = real time. */
  TEMPO: 0.80,

  /* ---- kicking ----
     Field goals and extra points are a timing test: a marker sweeps back
     and forth across a bar and the offense stops it. Longer kicks shrink
     the sweet spot and speed the marker up. The meter runs in REAL time
     (it is a reaction test, not part of the slowed simulation). */
  KICK_SWEET_BASE: 0.62,    // sweet-spot width, as a fraction of the bar...
  KICK_SWEET_PER_YD: 0.0105,// ...minus this per yard of kick distance
  KICK_SWEET_MIN: 0.07,
  KICK_SWEET_MAX: 0.50,
  KICK_SPEED_BASE: 1.3,     // full sweeps of the bar per second...
  KICK_SPEED_PER_YD: 0.022, // ...plus this per yard
  KICK_FLIGHT: 1.3,         // seconds the ball is in the air
  KICK_TIMEOUT: 6.0,        // never pressed? it gets kicked anyway
  POST_HALF: 3.08,          // uprights are 18.5 ft apart; half of that in yards

  /* ---- play clock (in simulation seconds, so TEMPO scales it too) ---- */
  MAX_HOLD: 5.0,      // QB must throw within this many seconds

  /* ---- speeds (yards / second) ---- */
  SPD_WR: 8.3,
  SPD_RB: 7.9,
  SPD_TE: 7.9,
  SPD_CB: 7.7,
  SPD_LB: 7.5,
  SPD_S:  7.4,
  SPD_DL: 2.75,        // rushing speed, deliberately slow (they are blocked)
  SPD_BALL: 26,

  /* Once somebody is running with the ball everyone turns into a
     pursuer, and they take an intercept angle instead of chasing. */
  PURSUE: { DL: 5.5, LB: 7.6, CB: 8.4, S: 8.4 },   // a back past the LBs is gone

  /* ---- pass rush ---- */
  BLOCK_EARLY: 0.25,  // rush speed multiplier while the line holds
  BLOCK_T0: 1.0,      // blocking is solid until here...
  BLOCK_T1: 3.4,      // ...and fully broken down by here
  SACK_DIST: 1.0,     // a rusher this close to the QB = sack
  SACK_LOSS: 6,       // yards lost on a sack

  /* ---- the run game ----
     Throwing to the RB while he is still behind the line is a handoff
     (or a pitch, if he has started moving). It cannot be dropped or
     picked, and for a moment the offensive line holds the rushers off
     him — that window is what lets a back get through the line. */
  RUN_BLOCK: 1.3,         // seconds the front seven are tied up after a handoff
  RUN_BLOCK_BOOSTED: 0.75, // ...unless the defense is pouring into the rush
  DB_READ: 0.5,           // corners and safeties read pass first for this long
  DAYLIGHT: 4.5,          // a ballcarrier veers away from defenders this close
  CUT_LOOKAHEAD: 3.5,     // he steers toward a point this far ahead. Smaller
                          // = sharper cuts. (10 here and he barely turns.)
  TACKLE_PROB: 0.65,      // contact brings him down this often...
  TACKLE_PROB_BOOSTED: 0.92, // ...or this often if that unit is boosted
  BEATEN_FOR: 0.7,        // a defender who whiffs is out of the play this long

  /* ---- catching ---- */
  CATCH_BASE: 0.26,   // completion % with a defender right on top of you
  CATCH_PER_YD: 0.18, // ...plus this much per yard of separation
  CATCH_MAX: 0.93,
  CATCH_DEPTH_PEN: 0.011, // deep balls are harder, per yard of air distance
  INT_WINDOW: 2.5,    // separation below this and a pick is possible
  INT_MAX: 0.20,      // pick chance when a defender is perfectly on it
  TACKLE_DIST: 1.5,   // defender this close to the ballcarrier = tackle.
                      // Must be generous or pursuers converge forever and
                      // never quite make contact.
};

/* ============================================================
   ROUTES
   A route is a list of points measured from the line of
   scrimmage: d = yards downfield, l = yards left/right.
   The first point is where the receiver lines up.
   When a receiver runs out of points they keep going straight.
   ============================================================ */

const PLAYS = [
  {
    name: 'FOUR VERTS',
    blurb: 'Everybody deep. Needs time — and time is what the rush takes away.',
    tag: 'DEEP SHOT',
    paRush: 1.0,
    routes: {
      WR1:[{d:0,l:-12},{d:26,l:-12}],
      WR2:[{d:0,l: 12},{d:26,l: 12}],
      TE: [{d:0,l:  4},{d:20,l:  6}],
      RB: [{d:-5,l: -4},{d: 2,l: -8},{d: 4,l:-12}],
    },
  },
  {
    name: 'MESH',
    blurb: 'Quick crossers underneath. Safe, fast, and it will not win the game alone.',
    tag: 'QUICK GAME',
    paRush: 1.0,
    routes: {
      WR1:[{d:0,l:-12},{d:3,l:-8},{d:4,l: 10}],
      WR2:[{d:0,l: 12},{d:5,l: 8},{d:6,l:-10}],
      TE: [{d:0,l:  4},{d:10,l: 6},{d:17,l: 13}],
      RB: [{d:-5,l: -4},{d: 1,l: -9},{d: 2,l:-12}],
    },
  },
  {
    name: 'SMASH',
    blurb: 'Out, corner and a hook. Chunk yardage if the safeties bite.',
    tag: 'INTERMEDIATE',
    paRush: 1.0,
    routes: {
      WR1:[{d:0,l:-12},{d:8,l:-12},{d:9,l:-13}],
      WR2:[{d:0,l: 12},{d:10,l: 11},{d:19,l: 13}],
      TE: [{d:0,l:  4},{d: 7,l:  3}],
      RB: [{d:-5,l: -4},{d: 4,l:  5},{d: 6,l: 9}],
    },
  },
  {
    name: 'PA BOOT',
    blurb: 'Play fake freezes the rush for a beat. Mixed depths, QB rolls out.',
    tag: 'PLAY ACTION',
    paRush: 0.45,     // rushers are slowed early by the fake
    rollout: 7,       // QB drifts this many yards sideways
    routes: {
      WR1:[{d:0,l:-12},{d:18,l:-4}],
      WR2:[{d:0,l: 12},{d: 4,l: 6},{d: 5,l:-6}],
      TE: [{d:0,l:  4},{d: 3,l: 11},{d: 4,l: 13}],
      RB: [{d:-5,l: -4},{d: 7,l: -6},{d:14,l:-10}],
    },
  },
];

/* The four throwing options, in key order.
   `name` is what the HUD says, `short` is what fits inside a 9px chip. */
const TARGETS = [
  { id:'WR1', key:'j', label:'J', name:'WR1', short:'W1', speed: CFG.SPD_WR },
  { id:'WR2', key:'k', label:'K', name:'WR2', short:'W2', speed: CFG.SPD_WR },
  { id:'TE',  key:'l', label:'L', name:'TE',  short:'TE', speed: CFG.SPD_TE },
  { id:'RB',  key:';', label:';', name:'RB',  short:'RB', speed: CFG.SPD_RB,
    hold: 0.7 },   // stays in the backfield this long before releasing
];

/* Defensive units and the key that boosts them. */
const UNITS = {
  DL: { key:'a', label:'RUSH' },
  LB: { key:'s', label:'LB'   },
  CB: { key:'d', label:'CB'   },
  S:  { key:'f', label:'SAF'  },
};

const TEAM_COLORS = ['#e8433f', '#2f8fe8'];
