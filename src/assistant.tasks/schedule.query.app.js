import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../config/geminiMainModel.config.js";
import scheduleQueryPrompt from "../prompts/schedule.query.prompt.js";

import GetChatHistory from "../db.tasks/chat.get.app.js";
import SaveChat from "../db.tasks/chat.save.app.js";
import GetUser from "../db.tasks/user.get.app.js";
import GetScheduleHistory from "../db.tasks/schedule.get.app.js";

const scheduleQueryChain = RunnableSequence.from([
  scheduleQueryPrompt,
  GeminiMainModel
]);

export default async function scheduleQueryApp(text, intent){

  if(!text || !intent){
    console.error("Invalid parameters for scheduleQueryApp");
    return;
  }

  const userData = await GetUser();
  const chatHistory = await GetChatHistory();

  const scheduleHistory = await GetScheduleHistory();

  try{

    const result = await scheduleQueryChain.invoke({
      inputText: text,
      intent: intent.intent,
      chatHistory: chatHistory.chats,
      userData: userData,
      scheduleData: scheduleHistory
    });

    if(!result.content){
      console.error("No content generated from schedule query model");
      return;
    }

    const clean = result.content
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
    console.error("Schedule query processing failed:", error.message);
  }

}