import ScheduleMemory from "../model/schedule.model.js";

export default async function SaveSchedule({
  userId,
  timeEvent,
  descriptionEvent,
  notificationRequired = false,
  notificationTime = null,
}) {
  try {
    if (!userId || !timeEvent || !descriptionEvent) {
      throw new Error("Missing required schedule fields");
    }

    const eventTime = new Date(timeEvent);
    if (isNaN(eventTime.getTime())) {
      throw new Error("Invalid timeEvent date");
    }

    let notifyTime = null;
    if (notificationRequired) {
      if (!notificationTime) {
        throw new Error("notificationTime required when notificationRequired is true");
      }

      notifyTime = new Date(notificationTime);
      if (isNaN(notifyTime.getTime())) {
        throw new Error("Invalid notificationTime date");
      }
    }

    const schedule = new ScheduleMemory({
      user_id: userId,
      time_event: eventTime,
      description_event: descriptionEvent,
      notification_required: notificationRequired,
      notification_time: notifyTime,
    });

    await schedule.save();

    return {
      success: true,
      id: schedule._id,
      time_updated: schedule.time_updated,
    };
  } catch (error) {
    console.error("SaveSchedule error:", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}
