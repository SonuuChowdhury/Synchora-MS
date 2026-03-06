import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../config/geminiMainModel.config.js";
import dotenv from "dotenv";
import scheduleAddPrompt from "../prompts/schedule.add.prompt.js";

import GetChatHistory from "../db.tasks/chat.get.app.js";
import SaveChat from "../db.tasks/chat.save.app.js";
import GetUser from "../db.tasks/user.get.app.js";

import ScheduleMemory from "../model/schedule.model.js";

dotenv.config();

const scheduleChain = RunnableSequence.from([
  scheduleAddPrompt,
  GeminiMainModel
]);

export default async function scheduleAddApp(text, intent){

  if(!text || !intent){
    console.error("Invalid parameters for scheduleAddApp");
    return;
  }

  const userData = await GetUser();
  const chatHistory = await GetChatHistory();

  try{

    const result = await scheduleChain.invoke({
      inputText: text,
      intent: intent.intent,
      chatHistory: chatHistory.chats,
      userData: userData
    });

    if(!result.content){
      console.error("No content generated from schedule model");
      return;
    }

    const clean = result.content
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

    if(parsed.schedule){

      await ScheduleMemory.create({
        description_event: parsed.schedule.description_event,
        time_event: new Date(parsed.schedule.time_event)
      });

    }

    return parsed.chat.message;

  }catch(error){
    console.error("Schedule add processing failed:", error.message);
  }

}