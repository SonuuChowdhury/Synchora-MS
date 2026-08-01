import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import financeQueryPrompt from "../../prompts/finance.query.prompt.js";
import GetChatHistory from "../../db.tasks/chat.get.app.js";
import SaveChat from "../../db.tasks/chat.save.app.js";
import GetUser from "../../db.tasks/user.get.app.js";
import GetFinanceHistory from "../../db.tasks/finance.get.app.js";

const financeQueryChain = RunnableSequence.from([
  financeQueryPrompt,
  GeminiMainModel
]);

export default async function financeQueryApp(text, intent){

  if(!text || !intent){
    console.error("Invalid parameters for financeQueryApp");
    return;
  }

  const userData = await GetUser();
  const chatHistory = await GetChatHistory();

  const financeHistory = await GetFinanceHistory();

  try{

    const result = await financeQueryChain.invoke({
      inputText: text,
      intent: intent.intent,
      chatHistory: chatHistory.chats,
      userData: userData,
      financeData: financeHistory
    });

    if(!result.content){
      console.error("No content generated from finance query model");
      return;
    }

    const textToClean = typeof result.content === "string" ? result.content : String(result.content || result || "");
    const clean = textToClean
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
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

    return parsed.chat.message;

  }catch(error){
    console.error("Finance query processing failed:", error.message);
  }
}