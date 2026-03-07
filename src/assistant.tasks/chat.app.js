import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../config/geminiMainModel.config.js";
import dotenv from "dotenv";
import GetChatHistory from "../db.tasks/chat.get.app.js";
import chatPrompt from "../prompts/chat.prompt.js";
import SaveChat from "../db.tasks/chat.save.app.js";
import GetUser from "../db.tasks/user.get.app.js";
import SaveUser from "../db.tasks/user.save.app.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ quiet: true });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename)
const modelDataPath = path.join(__dirname, "../json/meta.data.json");
const modelData = JSON.parse(
  fs.readFileSync(modelDataPath, "utf-8")
);

dotenv.config({ quiet: true });

const chatChain = RunnableSequence.from([
  chatPrompt,
  GeminiMainModel
]);

export default async function chatApp(text, intent){
    if(!text || !intent){
        console.error("Invalid parameters for chatApp");
        return;
    }
    const userData = await GetUser();
    const chatHistory = await GetChatHistory();

    try{
        const result = await chatChain.invoke({
            inputText: text,
            intent: intent.intent,
            chatHistory: chatHistory.chats,
            userData: userData,
            modelData: modelData
        });
        if(!result.content){
            console.error("No content generated from chat model");
        }
        const parsedChat = JSON.parse(result.content);
        const UserChatPayload = {
            role: "user",
            message: text,
            intent_detected: intent.intent,
            confidence: intent.confidence
        }
        await SaveChat(UserChatPayload)
        await SaveChat(parsedChat.chat);
        if(parsedChat.update_user){
            await SaveUser(parsedChat.user_update_data);
        }
        return parsedChat.chat.message;        
    }catch(error){
        console.error("Chat processing failed:", error.message);
    }
}