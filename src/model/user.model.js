import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  memories: [{
    type: { 
      type: String,
      enum: ["preference","fact","habit","goal","task","interest","relationship"]
    },
    key: String,
    value: String,
    confidence: { type: Number, default: 0.8 },
    source: { type: String, default: "chat" },
    created_at: { type: Date, default: Date.now },
    last_used: { type: Date, default: Date.now }
  }],
  preferred_tone: { type: String, enum: ["formal","casual","friendly","direct","motivational"], default: "friendly" },
  response_length: { type: String, enum: ["short","medium","detailed"], default: "medium" },
  language_style: { type: String, default: "simple" },

  emotional_trends: { stress: { type: Number, default: 0 }, excitement: { type: Number, default: 0 }, frustration: { type: Number, default: 0 }, confidence: { type: Number, default: 0 } },
  emotional_notes: { type: String, default: null },

  likes: { type: [String], default: [] },
  dislikes: { type: [String], default: [] },
  frequently_used_intents: { type: Map, of: Number, default: {} },
  correction_count: { type: Number, default: 0 },

  last_interaction: { type: Date, default: Date.now, index: true },
  timezone: { type: String, default: "Asia/Kolkata" },
}, { collection: "synchora_user_memory", versionKey: false });

const UserMemory = mongoose.model("UserMemory", userSchema);
export default UserMemory;
