import UserMemory from "../model/user.model.js";

export default async function SaveUser(updates = {}) {
  try {
    if (!updates || typeof updates !== "object") {
      throw new Error("updates must be an object");
    }

    const allowedFields = [
      "preferred_tone",
      "response_length",
      "language_style",
      "emotional_trends",
      "emotional_notes",
      "current_focus",
      "long_term_goals",
      "short_term_tasks",
      "likes",
      "dislikes",
      "frequently_used_intents",
      "correction_count",
      "timezone"
    ];

    const safeSet = {};
    const updateQuery = {};

    // Filter allowed fields
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeSet[field] = updates[field];
      }
    }

    // Apply $set updates
    if (Object.keys(safeSet).length > 0) {
      updateQuery.$set = safeSet;
    }

    // Handle memories separately
    if (Array.isArray(updates.memories) && updates.memories.length > 0) {
      updateQuery.$push = {
        memories: { $each: updates.memories }
      };
    }

    // Always update interaction time
    updateQuery.$set = {
      ...updateQuery.$set,
      last_interaction: new Date()
    };

    const user = await UserMemory.findOneAndUpdate(
      {},
      updateQuery,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return {success: true,user};

  } catch (error) {
    console.error("SaveUser error:", error.message);
    return {success: false,error: error.message
    };
  }
}