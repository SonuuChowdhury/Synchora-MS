import intentPrompt from "../../prompts/detectIntent.prompt.js";
import dotenv from "dotenv";
import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import appHandler from "../app.handeller.js";
import GetChatHistory from "../../db.tasks/chat.get.app.js";
import chalk from "chalk";

dotenv.config({ quiet: true });

const intentChain = RunnableSequence.from([
  intentPrompt,
  GeminiMainModel
]);

function cleanAndExtractJson(text) {
  let rawStr = "";
  if (typeof text !== "string") {
    if (text && typeof text.content === "string") {
      rawStr = text.content;
    } else if (text && Array.isArray(text.content)) {
      rawStr = text.content.map((c) => c.text || c).join("");
    } else {
      rawStr = String(text || "");
    }
  } else {
    rawStr = text;
  }

  let clean = rawStr.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    clean = jsonMatch[0];
  }
  return clean;
}

export default async function detectIntent(text, isTelegramClient = false) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { intent: "no_text", confidence: 1.0 };
  }

  try {
    const chatHistory = await GetChatHistory();
    const result = await intentChain.invoke({ input: text, chatHistory });

    const clean = cleanAndExtractJson(result);
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.warn("📌 ⚠️ [INTENT] JSON parsing failed — falling back to 'chat' intent.");
      parsed = { intent: "chat", confidence: 0.95 };
    }

    if (!parsed.intent || typeof parsed.confidence !== "number") {
      parsed = { intent: "chat", confidence: 0.95 };
    }

    console.log("📌 " + chalk.magenta("Intent:"), parsed.intent, "Confidence:", parsed.confidence);
    // now the intent is detrected for the text and now the text and intent will be passed to the app handeller where the tasks will be executed based on the intent and response will be generated and then sent back to the listen.js where runTTS function will handle the response.
    const resultFromApp = await appHandler(text, parsed, isTelegramClient);
    return resultFromApp;

  } catch (error) {
    console.error(chalk.magenta('\n📢 Intent detection failed:') + error.message+ "\n" + chalk.magenta('📢 Detailed error: ')+ error);
    return "Sorry, There was an internal agentic error on my system. Please try again later.";
  }
}
