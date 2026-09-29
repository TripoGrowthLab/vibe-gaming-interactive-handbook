// Gameplay tuning. All numbers come from GDD.md.
export const CFG = {
  STEP: 1 / 120,            // fixed simulation step (s); rendering interpolates between steps

  RUN_HALF_WIDTH: 12,       // corridor is x = -12 … +12
  SPEED_START: 12,          // m/s
  SPEED_GAIN: 0.3,          // m/s per second of run time
  SPEED_MAX: 38,            // m/s
  LAT_MAX: 9,               // max sideways speed (m/s)
  LAT_ACCEL: 60,            // m/s² while steering
  LAT_RETURN: 45,           // m/s² back to straight when released (~0.2 s)
  CRASH_TIME: 1.2,          // s from impact to Game Over screen

  SPAWN_AHEAD: 140,         // m ahead of the player that obstacles exist
  DESPAWN_BEHIND: 15,       // m behind the player before recycling
  START_CLEAR: 45,          // first obstacle row this far ahead of the start
  DIFFICULTY_DIST: 2500,    // distance at which the spawner reaches its hardest settings
  ROW_SPACING: [15, 7.5],   // m between rows, easy → hard
  GAP_WIDTH: [6, 3.2],      // guaranteed free gap between hitboxes, easy → hard (never below 3)
  ROW_COUNT: [2, 6],        // obstacles per row, easy → hard
  ROW_JITTER: 0.6,          // ± m of z jitter inside a row

  FENCE_SEG: 4,             // m per fence segment
};
