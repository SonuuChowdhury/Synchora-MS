import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import dotenv from "dotenv";
import financeAddPrompt from "../../prompts/finance.add.prompt.js";
import GetChatHistory from "../../db.tasks/chat.get.app.js";
import SaveChat from "../../db.tasks/chat.save.app.js";
import GetUser from "../../db.tasks/user.get.app.js";
import FinanceMemory from "../../model/finance.model.js";

dotenv.config({ quiet: true });

const financeChain = RunnableSequence.from([
  financeAddPrompt,
  GeminiMainModel
]);

export default async function financeAddApp(text, intent){

  if(!text || !intent){
    console.error("Invalid parameters for financeAddApp");
    return;
  }

  const userData = await GetUser();
  const chatHistory = await GetChatHistory();

  try{

    const result = await financeChain.invoke({
      inputText: text,
      intent: intent.intent,
      chatHistory: chatHistory.chats,
      userData: userData
    });

    if(!result.content){
      console.error("No content generated from finance model");
      return;
    }

    const textToClean = typeof result.content === "string" ? result.content : String(result.content || result || "");
    const clean = textToClean
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(clean);

    const UserChatPayload = {
      role: "user",
      message: text,
      intent_detected: intent.intent,
      confidence: intent.confidence
    };

    await SaveChat(UserChatPayload);

    await SaveChat(parsed.chat);

    if(parsed.finance){

      await FinanceMemory.create({
        type: parsed.finance.type,
        description: parsed.finance.description,
        amount: parsed.finance.amount
      });

    }

    return parsed.chat.message;

  }catch(error){
    console.error("Finance add processing failed:", error.message);
  }

}