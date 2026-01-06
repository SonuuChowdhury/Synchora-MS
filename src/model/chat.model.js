import mongoose from "mongoose";

const chatSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  time: { type: Date, default: Date.now, index: true },
  role: { type: String, enum: ["user","synchora"], required: true },
  message: { type: String, required: true, trim: true },
  intent_detected: { type: String, default: null },
  confidence: { type: Number, min: 0, max: 1, default: null },
}, { collection: "synchora_chat_memory", versionKey: false });

const ChatMemory = mongoose.model("ChatMemory", chatSchema);
export default ChatMemory;
