import Telemetry from "../model/telemetry.model.js";
import redisClient from "../config/redis.config.js";

const TELEMETRY_CACHE_KEY = "synchora:telemetry";

export default async function SaveTelemetry(data) {
  try {
    if (
      data.temperature === undefined ||
      data.humidity === undefined ||
      !data.longitude ||
      !data.latitude
    ) {
      throw new Error("temp, humidity, latitude, longitude required");
    }
    const telemetryData = {
      temperature: data.temperature,
      humidity: data.humidity,
      time: new Date(),
      location: {
        type: "Point",
        coordinates: [data.longitude, data.latitude],
      },
    };
    const saved = await Telemetry.create(telemetryData);
    try {
      if (redisClient.isReady) {
        const recent = await Telemetry.find()
          .sort({ time: -1 })
          .limit(10)
          .lean();
        await redisClient.setEx(
          TELEMETRY_CACHE_KEY,
          600,
          JSON.stringify(recent)
        );
      }
    } catch (redisErr) {
      console.warn("Redis cache failed:", redisErr.message);
    }
    return { success: true, data: saved };
  } catch (error) {
    console.error("SaveTelemetry error:", error);
    return { success: false, error: error.message };
  }
}