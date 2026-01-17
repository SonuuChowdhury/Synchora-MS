import FinanceMemory from "../model/finance.model.js";

export default async function GetFinanceHistory(userId) {
  try {
    if (!userId) {
      throw new Error("userId is required to fetch finance history");
    }

    const history = await FinanceMemory.find({ user_id: userId })
      .sort({ time: 1 })
      .lean();

    return history;
  } catch (error) {
    console.error("GetFinanceHistory error:", error.message);
    return [];
  }
}
