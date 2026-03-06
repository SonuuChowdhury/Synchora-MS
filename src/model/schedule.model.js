import mongoose from "mongoose";

const scheduleSchema = new mongoose.Schema({
  time_updated: { type: Date, default: Date.now, index: true },
  time_event: { type: Date, required: true, index: true },
  description_event: { type: String, required: true, trim: true },
}, { collection: "schedule_memory", versionKey: false });

const ScheduleMemory = mongoose.model("ScheduleMemory", scheduleSchema);
export default ScheduleMemory;
