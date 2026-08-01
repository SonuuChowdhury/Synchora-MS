import { generateEdgeTTS } from "./edgeTts.js";

/**
 * DEPRECATED — ElevenLabs has been replaced by 100% Free Microsoft Edge Neural TTS.
 * This module proxies to generateEdgeTTS for backward compatibility.
 */
export async function streamElevenLabsTTS(text, socket) {
  console.log("📌 [TTS] (Deprecated ElevenLabs module called) -> Forwarding to Microsoft Edge Neural TTS...");
  return generateEdgeTTS(text);
}
