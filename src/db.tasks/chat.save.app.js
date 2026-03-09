import ChatMemory from "../model/chat.model.js";
import redisClient from "../config/redis.config.js";

const CHAT_CACHE_KEY = "synchora:chat_history";

export default async function SaveChat(data) {
  try {
    if (!data.role || !data.message) {
      throw new Error("role and message are required");
    }

    const chatData = {
      role:data.role,
      message: data.message,
      intent_detected: data.intent,
      confidence:data.confidence
    };

    const updatedDoc = await ChatMemory.findOneAndUpdate(
      {},
      { $push: { chats: chatData } },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    await redisClient.setEx(
      CHAT_CACHE_KEY,
      600,
      JSON.stringify(updatedDoc)
    );
    return { success: true };
  } catch (error) {
    console.error("SaveChat error:", error);
    return {success: false, error: error.message,};
  }
}
