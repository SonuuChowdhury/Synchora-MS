import { RunnableSequence } from "@langchain/core/runnables";
import GeminiMainModel from "../../config/geminiMainModel.config.js";
import dotenv from "dotenv";

import GetChatHistory from "../../db.tasks/chat.get.app.js";
import chatPrompt from "../../prompts/chat.prompt.js";
import SaveChat from "../../db.tasks/chat.save.app.js";
import GetUser from "../../db.tasks/user.get.app.js";
import SaveUser from "../../db.tasks/user.save.app.js";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config({ quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const modelDataPath = path.join(__dirname, "../../json/meta.data.json");
const modelData = JSON.parse(
  fs.readFileSync(modelDataPath, "utf-8")
);

const chatChain = RunnableSequence.from([
  chatPrompt,
  GeminiMainModel
]);

export default async function chatApp(text, intent) {

  if (!text || !intent) {
    console.error("Invalid parameters for chatApp");
    return "Invalid input.";
  }

  try {

    const userData = await GetUser();
    const chatHistory = await GetChatHistory();

    const result = await chatChain.invoke({
      inputText: text,
      intent: intent.intent,
      chatHistory: chatHistory?.chats || chatHistory || [],
      userData: userData || {},
      modelData: modelData
    });

    // console.log("input: " , text, "intent: ", intent, "userData: ", userData, "chatHistory: ", chatHistory, "modelData: ", modelData); // Log to check what data going to Model

    if (!result?.content) {
      console.error("No content generated from chat model");
      return "Sorry, I couldn't respond right now.";
    }

    let parsedChat;

    try {
      parsedChat = JSON.parse(result.content);
    } catch (err) {
      console.error("Invalid JSON from model:", result.content);
      return "Sorry, something went wrong.";
    }

    // Save user message
    await SaveChat({
      role: "user",
      message: text,
      intent: intent.intent,
      confidence: intent.confidence
    });

    // Save assistant message
    await SaveChat(parsedChat.chat);

    // Save user memory if needed
    if (parsedChat.update_user && parsedChat.user_update_data) {
      await SaveUser(parsedChat.user_update_data);
    }

    return parsedChat.chat?.message || "Sorry, I couldn't respond.";

  } catch (error) {
    console.error("Chat processing failed:", error.message);
    return "Something went wrong.";
  }
}