/**
 * Scrabble app configuration.
 * Update API_URL after deploying scrabble-api.
 * SUPABASE_URL + ANON_KEY are for Realtime subscriptions only (not data writes).
 */
var SCRABBLE_CONFIG = {
  API_URL: 'https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/scrabble-api',
  SUPABASE_URL: 'https://yzyipxvlsoxfphwobfkb.supabase.co',
  /** Publishable anon key — Realtime only. Paste from Supabase Dashboard → Settings → API.
   * Leave blank until Realtime is needed; online play still works via polling heartbeat fallback. */
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eWlweHZsc294ZnBod29iZmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODU4OTksImV4cCI6MjA5MjQ2MTg5OX0.Gq7KB_FtV43fijZ3Z3lvq1JH6_Bm0fjgdHZ1MN9NmFg',
  BASE_PATH: '',
  DEFAULT_CHALLENGES: 2,
  DEFAULT_PLAYER_COUNT: 2,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,
  RACK_SIZE: 7,
  HEARTBEAT_MS: 45000
};
