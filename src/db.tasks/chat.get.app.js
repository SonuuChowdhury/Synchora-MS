import ChatMemory from "../model/chat.model.js";
import redisClient from "../config/redis.config.js";

const CHAT_CACHE_KEY = "synchora:chat_history";

export default async function GetChatHistory() {
  try {
    // Try Redis cache first
    try {
      if (redisClient.isReady) {
        const cachedChats = await redisClient.get(CHAT_CACHE_KEY);
        if (cachedChats) {
          return JSON.parse(cachedChats);
        }
      }
    } catch (redisErr) {
      console.warn("Redis get failed, falling back to DB:", redisErr.message);
    }

    // Fallback to MongoDB
    const chatDoc = await ChatMemory.findOne(
      {},
      { chats: { $slice: -10 } }
    ).lean();

    // Try to cache the result
    try {
      if (redisClient.isReady) {
        await redisClient.setEx(
          CHAT_CACHE_KEY,
          600,
          JSON.stringify(chatDoc)
        );
      }
    } catch (redisErr) {
      console.warn("Redis set failed:", redisErr.message);
    }

    return chatDoc;
  } catch (error) {
    console.error("GetChatHistory error:", error.message);
    return null;
  }
}