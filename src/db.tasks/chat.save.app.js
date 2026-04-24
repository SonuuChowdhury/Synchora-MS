import ChatMemory from "../model/chat.model.js";
import redisClient from "../config/redis.config.js";

const CHAT_CACHE_KEY = "synchora:chat_history";

export default async function SaveChat(data) {
  try {
    if (!data.role || !data.message) {
      throw new Error("role and message are required");
    }

    const chatData = {
      role: data.role,
      message: data.message,
      intent_detected: data.intent,
      confidence: data.confidence,
      time: new Date().toISOString()
    };

    const updatedDoc = await ChatMemory.findOneAndUpdate(
      {},
      { $push: { chats: chatData } },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    // Try to update Redis cache — skip silently if unavailable
    try {
      if (redisClient.isReady) {
        const recentChats = updatedDoc.chats.slice(-10);
        await redisClient.setEx(
          CHAT_CACHE_KEY,
          600,
          JSON.stringify(recentChats)
        );
      }
    } catch (redisErr) {
      console.warn("Redis cache update failed:", redisErr.message);
    }

    return { success: true };

  } catch (error) {
    console.error("SaveChat error:", error);
    return { success: false, error: error.message };
  }
}