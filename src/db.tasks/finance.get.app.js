import FinanceMemory from "../model/finance.model.js";

export default async function GetFinanceHistory() {
  try {

    const history = await FinanceMemory.find({})
      .sort({ time_added: 1 })
      .lean();

    return history;

  } catch (error) {
    console.error("GetFinanceHistory error:", error.message);
    return [];
  }
}