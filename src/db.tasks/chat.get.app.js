import ChatMemory from "../model/chat.model.js";

export default async function GetChatHistory() {
  try {
    const chatDoc = await ChatMemory.findOneAndUpdate(
      {},                 // single-document collection
      { $setOnInsert: {} },
      {
        new: true,
        upsert: true,
        lean: true,
      }
    );

    return chatDoc;
  } catch (error) {
    console.error("GetChatHistory error:", error.message);
    return null;
  }
}
