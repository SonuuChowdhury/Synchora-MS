import ScheduleMemory from "../model/schedule.model.js";

export default async function GetScheduleHistory() {
  try {
    const history = await ScheduleMemory.find()
      .sort({ time: 1 })
      .lean();

    return history;
  } catch (error) {
    console.error("GetScheduleHistory error:", error.message);
    return [];
  }
}
