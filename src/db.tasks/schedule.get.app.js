import ScheduleMemory from "../model/schedule.model.js";

export default async function GetScheduleHistory(userId) {
  try {
    if (!userId) {
      throw new Error("userId is required to fetch schedule history");
    }

    const history = await ScheduleMemory.find({ user_id: userId })
      .sort({ time: 1 })
      .lean();

    return history;
  } catch (error) {
    console.error("GetScheduleHistory error:", error.message);
    return [];
  }
}
