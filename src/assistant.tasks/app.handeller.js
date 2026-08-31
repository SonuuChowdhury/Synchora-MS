import { researchAgent } from "./task.graph/autonomous.research.agent.js";
import emergencyProtocol from "./tasks.chain/emergency.protocol.js";
import GetLatestTelemetry from "../db.tasks/telemetry.data.get.js";
import createLogger from "../utils/logger.js";

const log = createLogger("HANDLER");

export default async function appHandler(text, parsedIntent, isTelegramClient) {
  if (!parsedIntent || !parsedIntent.intent) {
    log.error("Invalid intent object passed to appHandler");
    return "I couldn't process your request.";
  }

  const intentStr = parsedIntent.intent;
  log.info(`Handling intent: ${intentStr}`);

  // Research Query -> Delegate to Autonomous Research Agent
  if (intentStr === "research_query") {
    try {
      const researchRes = await researchAgent.invoke({
        userQuery: text,
        augmentedQuery: text,      // seed first search with raw user query
        mustSearch: true,           // force at least one real web search
        intent: intentStr,
        confidence: parsedIntent.confidence || 0.9,
        allowHTML: isTelegramClient
      });
      return researchRes.finalAnswer || "I couldn't find a clear answer to your search request.";
    } catch (err) {
      log.error("Research agent invocation failed:", err.message);
      return "I ran into an issue searching for that.";
    }
  }

  // Weather Query -> Read live sensor telemetry
  if (intentStr === "weather_query") {
    try {
      const telemetry = await GetLatestTelemetry();
      if (!telemetry) {
        return "I don't have sensor data right now. The device may not be connected.";
      }
      const temp = telemetry.temperature;
      const humidity = telemetry.humidity;
      let feel = "comfortable";
      if (temp >= 38) feel = "very hot";
      else if (temp >= 32) feel = "quite warm";
      else if (temp >= 27) feel = "warm";
      else if (temp <= 18) feel = "cool";

      const humidDesc = humidity >= 80 ? " and very humid" : humidity >= 60 ? " with moderate humidity" : "";
      return `It is currently ${temp} degrees${humidDesc} around you, which feels ${feel}. ${humidity >= 85 ? "It may feel uncomfortable — stay hydrated." : ""}`.trim();
    } catch (err) {
      log.error("Weather query handler error:", err.message);
      return "I had trouble reading the sensor data right now.";
    }
  }

  // Cancel -> Acknowledge and stop
  if (intentStr === "cancel") {
    return "Okay, cancelled.";
  }

  // Emergency SOS Trigger
  if (intentStr === "emergency_help") {
    try {
      await emergencyProtocol();
      return "Activated emergency protocol. Alert notifications dispatched.";
    } catch (err) {
      log.error("Emergency protocol error:", err.message);
      return "Emergency protocol triggered. Please stay calm.";
    }
  }

  // Unsupported or Empty
  if (intentStr === "no_support") {
    return "I'm sorry, I cannot perform that action right now.";
  }

  if (intentStr === "no_text" || intentStr === "error") {
    return "I didn't catch that. Could you please repeat?";
  }

  // Unified response for chat / finance / schedule
  return parsedIntent.response || "I am ready to help.";
}