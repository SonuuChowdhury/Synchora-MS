import ChatMemory from "../model/chat.model.js";
import redisClient from "../config/redis.config.js";

const CHAT_CACHE_KEY = "synchora:chat_history";

export default async function GetChatHistory() {
  try {
    const cachedChats = await redisClient.get(CHAT_CACHE_KEY);
    if (cachedChats) {
      return JSON.parse(cachedChats);
    }

    const chatDoc = await ChatMemory.findOne(
      {},
      { chats: { $slice: -10 } } // last 20 chats
    ).lean();

     await redisClient.setEx(
      CHAT_CACHE_KEY,
      600, // seconds
      JSON.stringify(chatDoc)
    );

    return chatDoc;
  } catch (error) {
    console.error("GetChatHistory error:", error.message);
    return null;
  }
}
