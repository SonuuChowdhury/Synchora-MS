import FinanceMemory from "../model/finance.model.js";

export default async function SaveFinance({
  userId,
  type,
  description,
  amount,
}) {
  try {
    if (!userId || !type || !description || amount === undefined) {
      throw new Error("Missing required finance fields");
    }

    if (!["debit", "credit"].includes(type)) {
      throw new Error("Invalid finance type");
    }

    if (amount < 0) {
      throw new Error("Amount must be a positive number");
    }

    const finance = new FinanceMemory({
      user_id: userId,
      type,
      description,
      amount,
    });

    await finance.save();

    return {
      success: true,
      id: finance._id,
      time_added: finance.time_added,
    };
  } catch (error) {
    console.error("SaveFinance error:", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
}
