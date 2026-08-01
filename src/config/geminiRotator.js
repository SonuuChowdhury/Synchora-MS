import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import createLogger from "../utils/logger.js";
import dotenv from "dotenv";

const log = createLogger("GEMINI_ROTATOR");

let geminiKeys = null;
let currentKeyIndex = 0;

function loadKeys() {
  dotenv.config({ quiet: true });
  const collectedKeys = [];

  // 1. Parse comma/newline/space separated strings in GEMINI_API_KEYS or GEMINI_API_KEY
  const primaryValues = [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY];
  primaryValues.forEach((val) => {
    if (val && typeof val === "string") {
      val
        .split(/[\n,\s]+/)
        .map((k) => k.replace(/["']/g, "").trim())
        .filter(Boolean)
        .forEach((k) => collectedKeys.push(k));
    }
  });

  // 2. Also scan process.env for indexed keys (e.g. GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.)
  for (const [envKey, val] of Object.entries(process.env)) {
    if (
      envKey.startsWith("GEMINI_") &&
      envKey.includes("KEY") &&
      envKey !== "GEMINI_API_KEYS" &&
      envKey !== "GEMINI_API_KEY"
    ) {
      if (val && typeof val === "string") {
        val
          .split(/[\n,\s]+/)
          .map((k) => k.replace(/["']/g, "").trim())
          .filter(Boolean)
          .forEach((k) => collectedKeys.push(k));
      }
    }
  }

  // Deduplicate keys while preserving order
  const keys = Array.from(new Set(collectedKeys));

  if (keys.length === 0) {
    log.error("No Gemini API keys found in environment variables");
  } else {
    log.info(`Loaded ${keys.length} Gemini API key(s) into active rotation pool`);
  }
  return keys;
}

function ensureKeysLoaded() {
  if (!geminiKeys) {
    geminiKeys = loadKeys();
  }
  return geminiKeys;
}

export function getActiveGeminiKey() {
  const keys = ensureKeysLoaded();
  if (keys.length === 0) return "";
  return keys[currentKeyIndex];
}

export function rotateGeminiKey(reason = "Rate limit / Quota limit hit") {
  const keys = ensureKeysLoaded();
  if (keys.length <= 1) {
    log.warn(`Only ${keys.length} key in pool — cannot rotate`);
    return getActiveGeminiKey();
  }

  const oldIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  log.warn(`${reason} on Key #${oldIndex + 1}. Rotating to Key #${currentKeyIndex + 1}`);
  return getActiveGeminiKey();
}

export function createGeminiModel(temperature = 0) {
  const apiKey = getActiveGeminiKey();
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: temperature,
    apiKey: apiKey,
    maxRetries: 0,
    timeout: 10000,
  });
}
