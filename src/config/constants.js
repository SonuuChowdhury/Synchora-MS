/**
 * Centralized Application Constants for Synchora-MS
 */

export const CHAT_HISTORY_LIMIT    = 8;       // Number of recent chat messages in context
export const REDIS_CHAT_TTL        = 300;     // Seconds to cache chat history (5 mins)
export const REDIS_RESEARCH_TTL    = 600;     // Seconds to cache web search results (10 mins)
export const MAX_RESEARCH_STEPS    = 3;       // Maximum web search iterations in research agent
export const TTS_END_BUFFER_MS     = 200;     // Extra buffer time after audio ends before TTS_END
export const VAD_THRESHOLD         = 500;     // Silence RMS threshold for audio VAD
export const RECONNECT_BASE_MS     = 500;     // WS reconnect starting interval
export const RECONNECT_MAX_MS      = 5000;    // WS reconnect cap
export const GEMINI_COOLDOWN_MS    = 60000;   // Cooldown period after all keys hit quota
