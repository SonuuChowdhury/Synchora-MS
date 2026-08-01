import { RunnableLambda } from "@langchain/core/runnables";
import { createGeminiModel, rotateGeminiKey } from "./geminiRotator.js";
import createLogger from "../utils/logger.js";

const log = createLogger("GEMINI");

/**
 * LangChain-compatible RunnableLambda proxy with automatic multi-key failover loop.
 * Retries across available keys on 429 (Quota/Rate limit) and 403 (Forbidden/Leaked) errors.
 */
const GeminiMainModelProxy = new RunnableLambda({
  func: async (promptValue) => {
    let attempts = 0;
    const maxAttempts = 8;

    while (attempts < maxAttempts) {
      try {
        const model = createGeminiModel(0);
        const result = await model.invoke(promptValue);

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

      } catch (err) {
        attempts++;
        const errMsg = err.message || "";
        const shouldRotate =
          errMsg.includes("429") ||
          errMsg.includes("403") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("quota") ||
          errMsg.includes("Forbidden") ||
          errMsg.includes("leaked") ||
          err.status === 429 ||
          err.status === 403;

        if (shouldRotate && attempts < maxAttempts) {
          const reason = errMsg.includes("403") || errMsg.includes("Forbidden") || errMsg.includes("leaked")
            ? "API Key Leaked / Forbidden"
            : "Rate limit / Quota exceeded";

          rotateGeminiKey(reason);
          log.warn(`Retrying Gemini request (attempt ${attempts + 1}/${maxAttempts}) with rotated API key...`);
        } else {
          throw err;
        }
      }
    }
  }
});

export default GeminiMainModelProxy;