import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

function loadKeys() {
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
    console.error(chalk.red("❌ [GEMINI ROTATOR] No Gemini API keys found in .env!"));
  } else {
    console.log(
      chalk.cyan(
        `📌 [GEMINI ROTATOR] Loaded ${keys.length} Gemini API Key(s) into active rotation pool.`
      )
    );
  }
  return keys;
}

const geminiKeys = loadKeys();
let currentKeyIndex = 0;

export function getActiveGeminiKey() {
  if (geminiKeys.length === 0) return "";
  return geminiKeys[currentKeyIndex];
}

export function rotateGeminiKey(reason = "Rate limit / Quota limit hit") {
  if (geminiKeys.length <= 1) {
    console.warn(
      chalk.yellow(
        `⚠️ [GEMINI ROTATOR] Only ${geminiKeys.length} key in pool — cannot rotate.`
      )
    );
    return getActiveGeminiKey();
  }

  const oldIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % geminiKeys.length;
  console.log(
    chalk.bgYellow.black.bold(
      ` 🔄 [GEMINI ROTATOR] ${reason} on Key #${oldIndex + 1}! Rotating to Key #${currentKeyIndex + 1}... `
    )
  );
  return getActiveGeminiKey();
}

export function createGeminiModel(temperature = 0) {
  const apiKey = getActiveGeminiKey();
  return new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: temperature,
    apiKey: apiKey,
  });
}
