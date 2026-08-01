import { RunnableLambda } from "@langchain/core/runnables";
import { createGeminiModel, rotateGeminiKey } from "./geminiRotator.js";
import chalk from "chalk";

/**
 * LangChain-compatible RunnableLambda proxy with auto key rotation on 429 / Quota errors.
 * This MUST be a RunnableLambda so RunnableSequence can pipe into it correctly.
 */
const GeminiMainModelProxy = new RunnableLambda({
  func: async (promptValue) => {
    let result;
    try {
      const model = createGeminiModel(0);
      result = await model.invoke(promptValue);
    } catch (err) {
      const isQuotaError =
        err.message?.includes("429") ||
        err.message?.includes("RESOURCE_EXHAUSTED") ||
        err.message?.includes("quota") ||
        err.status === 429;

      if (isQuotaError) {
        rotateGeminiKey("Rate limit / Quota exceeded");
        console.log(chalk.yellow("📌 [GEMINI] 🔄 Retrying with rotated API key..."));
        const newModel = createGeminiModel(0);
        result = await newModel.invoke(promptValue);
      } else {
        throw err;
      }
    }

    // Normalize output to always return a plain { content: string } object
    if (typeof result === "string") {
      return { content: result };
    }
    if (result && typeof result.content === "string") {
      return result;
    }
    if (result && Array.isArray(result.content)) {
      return { content: result.content.map((c) => c.text || String(c)).join("") };
    }
    return { content: String(result || "") };
  }
});

export default GeminiMainModelProxy;