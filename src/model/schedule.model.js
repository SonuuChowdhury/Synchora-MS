import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  time_updated: { type: Date, default: Date.now, index: true },
  time_event: { type: Date, required: true, index: true },
  description_event: { type: String, required: true, trim: true },
  notification_required: { type: Boolean, default: false, index: true },
  notification_time: { type: Date, default: null, index: true },
}, { collection: "schedule_memory", versionKey: false });

const ScheduleMemory = mongoose.model("ScheduleMemory", scheduleSchema);
export default ScheduleMemory;
