import mongoose from "mongoose";

const financeSchema = new mongoose.Schema({
  user_id: { type: String, required: true, index: true },
  time_added: { type: Date, default: Date.now, index: true },
  type: { type: String, required: true, enum: ["debit", "credit"] },
  description: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
}, { collection: "synchora_finance_memory", versionKey: false });

const FinanceMemory = mongoose.model("FinanceMemory", financeSchema);
export default FinanceMemory;
