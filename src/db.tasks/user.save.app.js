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
      "timezone",
    ];

    const safeUpdates = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    safeUpdates.last_interaction = new Date();

    const user = await UserMemory.findOneAndUpdate(
      {},
      { $set: safeUpdates },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    ).lean();

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error("SaveUser error:", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}
