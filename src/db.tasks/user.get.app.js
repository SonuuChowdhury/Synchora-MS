import UserMemory from "../model/user.model.js";

export default async function GetUser() {
  try {
    const user = await UserMemory.findOneAndUpdate(
      {},                 // single-document collection
      { $setOnInsert: {} },// schema defaults will apply
      {
        new: true,        // return the document
        upsert: true,     // create if it doesn't exist
        lean: true,       // plain JS object
      }
    );

    return user;
  } catch (error) {
    console.error("GetUser error:", error.message);
    return null;
  }
}
