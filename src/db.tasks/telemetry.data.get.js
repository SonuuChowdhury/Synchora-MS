import Telemetry from "../model/telemetry.model.js";
import redisClient from "../config/redis.config.js";

const TELEMETRY_CACHE_KEY = "synchora:latest_telemetry";

export default async function GetLatestTelemetry() {
  try {
    try {
      if (redisClient.isReady) {
        const cached = await redisClient.get(TELEMETRY_CACHE_KEY);
        if (cached) {
          return JSON.parse(cached);
        }
      }
    } catch (err) {
      console.warn("Redis get failed:", err.message);
    }
    const latest = await Telemetry.findOne({})
      .sort({ time: -1 })
      .lean();

    if (!latest) return null;
    try {
      if (redisClient.isReady) {
        await redisClient.setEx(
          TELEMETRY_CACHE_KEY,
          600,
          JSON.stringify(latest)
        );
      }
    } catch (err) {
      console.warn("Redis set failed:", err.message);
    }
    return latest;
  } catch (error) {
    console.error("GetLatestTelemetry error:", error.message);
    return null;
  }
}