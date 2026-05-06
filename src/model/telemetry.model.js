import mongoose from "mongoose";

const telemetrySchema = new mongoose.Schema({
  time: { type: Date, default: Date.now, index: true },
  temperature: { type: Number, required: true }, // °C
  humidity: { type: Number, required: true },    // %
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  }
}, { collection: "synchora_telemetry", versionKey: false });
telemetrySchema.index({ location: "2dsphere" });
const Telemetry = mongoose.model("Telemetry", telemetrySchema);
export default Telemetry;