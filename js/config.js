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
  XP_MAKE: 0.94,      // extra point kick success rate
  ENERGY_POOL: 100,   // defense energy, refilled each possession
  ENERGY_DRAIN: 13,   // energy per second while holding a unit key
  BOOST_DL: 1.62,     // rush gets a big multiplier: it is the defense's clock
  BOOST_COV: 1.30,    // coverage gets a smaller one
  COVER_LAG: 0.20,    // seconds a man defender trails the receiver.
                      // THIS is where separation comes from: the defender
                      // chases where you WERE, so sharp cuts break him off.
  COVER_LAG_BOOST: 0.55, // boosting a unit cuts its reaction time by this much

  /* ---- play clock ---- */
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
  PURSUE: { DL: 7.0, LB: 8.0, CB: 8.4, S: 8.4 },

  /* ---- pass rush ---- */
  BLOCK_EARLY: 0.25,  // rush speed multiplier while the line holds
  BLOCK_T0: 1.0,      // blocking is solid until here...
  BLOCK_T1: 3.4,      // ...and fully broken down by here
  SACK_DIST: 1.0,     // a rusher this close to the QB = sack
  SACK_LOSS: 6,       // yards lost on a sack

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
      X:  [{d:0,l:-12},{d:26,l:-12}],
      Z:  [{d:0,l: 12},{d:26,l: 12}],
      TE: [{d:0,l:  4},{d:20,l:  6}],
      RB: [{d:-2,l: -3},{d: 2,l: -8},{d: 4,l:-12}],
    },
  },
  {
    name: 'MESH',
    blurb: 'Quick crossers underneath. Safe, fast, and it will not win the game alone.',
    tag: 'QUICK GAME',
    paRush: 1.0,
    routes: {
      X:  [{d:0,l:-12},{d:3,l:-8},{d:4,l: 10}],
      Z:  [{d:0,l: 12},{d:5,l: 8},{d:6,l:-10}],
      TE: [{d:0,l:  4},{d:10,l: 6},{d:17,l: 13}],
      RB: [{d:-2,l: -3},{d: 1,l: -9},{d: 2,l:-12}],
    },
  },
  {
    name: 'SMASH',
    blurb: 'Out, corner and a hook. Chunk yardage if the safeties bite.',
    tag: 'INTERMEDIATE',
    paRush: 1.0,
    routes: {
      X:  [{d:0,l:-12},{d:8,l:-12},{d:9,l:-13}],
      Z:  [{d:0,l: 12},{d:10,l: 11},{d:19,l: 13}],
      TE: [{d:0,l:  4},{d: 7,l:  3}],
      RB: [{d:-2,l: -3},{d: 4,l:  5},{d: 6,l: 9}],
    },
  },
  {
    name: 'PA BOOT',
    blurb: 'Play fake freezes the rush for a beat. Mixed depths, QB rolls out.',
    tag: 'PLAY ACTION',
    paRush: 0.45,     // rushers are slowed early by the fake
    rollout: 7,       // QB drifts this many yards sideways
    routes: {
      X:  [{d:0,l:-12},{d:18,l:-4}],
      Z:  [{d:0,l: 12},{d: 4,l: 6},{d: 5,l:-6}],
      TE: [{d:0,l:  4},{d: 3,l: 11},{d: 4,l: 13}],
      RB: [{d:-2,l: -3},{d: 7,l: -6},{d:14,l:-10}],
    },
  },
];

/* The four throwing options, in key order. */
const TARGETS = [
  { id:'X',  key:'j', label:'J', name:'X',  speed: CFG.SPD_WR },
  { id:'Z',  key:'k', label:'K', name:'Z',  speed: CFG.SPD_WR },
  { id:'TE', key:'l', label:'L', name:'TE', speed: CFG.SPD_TE },
  { id:'RB', key:';', label:';', name:'RB', speed: CFG.SPD_RB },
];

/* Defensive units and the key that boosts them. */
const UNITS = {
  DL: { key:'a', label:'RUSH' },
  LB: { key:'s', label:'LB'   },
  CB: { key:'d', label:'CB'   },
  S:  { key:'f', label:'SAF'  },
};

const TEAM_COLORS = ['#e8433f', '#2f8fe8'];
