import intentPrompt from "../prompts/detectIntent.prompt.js";
import dotenv from "dotenv";
import { RunnableSequence } from "@langchain/core/runnables";
import GeminiInDetModel from "../config/geminiDetectionModel.config.js";
import appHandler from "./app.handeller.js";

dotenv.config();

const intentChain = RunnableSequence.from([
  intentPrompt,
  GeminiInDetModel
]);

function cleanJsonOutput(text) {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

export default async function detectIntent(text, userID) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { intent: "no_text", confidence: 1.0 };
  }

  try {
    const result = await intentChain.invoke({ input: text });

    const clean = cleanJsonOutput(result.content);
    const parsed = JSON.parse(clean);

    if (!parsed.intent || typeof parsed.confidence !== "number") {
      throw new Error("Invalid intent response format");
    }

    console.log("🎯 Intent:", parsed.intent, "Confidence:", parsed.confidence);
    const resultFromApp = await appHandler(text, parsed);
    return resultFromApp;

  } catch (error) {
    console.error("Intent detection failed:", error.message);
    return { intent: "error", confidence: 0.0 };
  }
}
