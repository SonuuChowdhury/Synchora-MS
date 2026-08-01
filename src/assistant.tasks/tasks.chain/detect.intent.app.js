import unifiedPrompt from "../../prompts/unified.prompt.js";
import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import appHandler from "../app.handeller.js";
import GetChatHistory from "../../db.tasks/chat.get.app.js";
import GetUser from "../../db.tasks/user.get.app.js";
import SaveChat from "../../db.tasks/chat.save.app.js";
import SaveUser from "../../db.tasks/user.save.app.js";
import createLogger from "../../utils/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const log = createLogger("INTENT");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelDataPath = path.join(__dirname, "../../json/meta.data.json");
const modelData = JSON.parse(fs.readFileSync(modelDataPath, "utf-8"));

const unifiedChain = RunnableSequence.from([unifiedPrompt, GeminiMainModel]);

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

export default async function processVoicePipeline(text, isTelegramClient = false) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return "I didn't catch that. Could you please repeat?";
  }

  try {
    const startTime = Date.now();
    log.info(`Processing input: "${text}"`);

    // Parallel DB fetching
    const [userData, chatHistoryDoc] = await Promise.all([
      GetUser(),
      GetChatHistory()
    ]);

    const chatHistory = chatHistoryDoc?.chats || chatHistoryDoc || [];

    // Unified single-pass Gemini call
    const result = await unifiedChain.invoke({
      inputText: text,
      chatHistory: JSON.stringify(chatHistory.slice(-8)),
      userData: JSON.stringify(userData || {}),
      modelData: JSON.stringify(modelData)
    });

    const clean = cleanAndExtractJson(result);
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      log.warn("JSON parsing failed on unified output — falling back to plain response");
      parsed = {
        intent: "chat",
        response: typeof result === "string" ? result : result?.content || "I am here to help.",
        db_action: null,
        update_user: false,
        user_update_data: null
      };
    }

    const duration = Date.now() - startTime;
    log.info(`Unified chain completed in ${duration}ms (Intent: ${parsed.intent})`);

    // Asynchronous background memory & chat persistence (non-blocking for fast TTS response)
    Promise.all([
      SaveChat({
        role: "user",
        message: text,
        intent: parsed.intent,
        confidence: 0.95
      }),
      parsed.response ? SaveChat({
        role: "synchora",
        message: parsed.response,
        intent: parsed.intent,
        confidence: 0.95
      }) : Promise.resolve(),
      (parsed.update_user && parsed.user_update_data) ? SaveUser(parsed.user_update_data) : Promise.resolve()
    ]).catch((err) => log.error("Background DB memory save error:", err.message));

    // Handle intent-specific actions (e.g. research agent or special handlers)
    const finalResponse = await appHandler(text, parsed, isTelegramClient);
    return finalResponse || parsed.response;

  } catch (error) {
    log.error("Pipeline failure:", error.message);
    return "Sorry, an internal error occurred. Please try again later.";
  }
}
