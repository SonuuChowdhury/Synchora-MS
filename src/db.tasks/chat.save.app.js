import ChatMemory from "../model/chat.model.js";

export default async function SaveChat(data) {
  try {
    if (!data.role || !data.message) {
      throw new Error("role and message are required");
    }

    // 🧠 Chat object (defaults handled by schema)
    const chatData = {
      role:data.role,
      message: data.message,
      intent_detected: data.intent,
      confidence:data.confidence
    };

    /**
     * 🔥 Find the single document & push chat
     * - upsert: true → create doc if not exists
     * - $push → append to chats array
     */
    await ChatMemory.findOneAndUpdate(
      {},
      { $push: { chats: chatData } },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    return { success: true };
  } catch (error) {
    console.error("SaveChat error:", error);

    return {
      success: false,
      error: error.message,
    };
  }
}
