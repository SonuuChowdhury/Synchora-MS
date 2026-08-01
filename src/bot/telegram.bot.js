import SynchoraBot from "../config/bot.config.js";
import detectIntent from "../assistant.tasks/tasks.chain/detect.intent.app.js";
import createLogger from "../utils/logger.js";

const log = createLogger("TELEGRAM");
const configuredChatID = process.env.TELEGRAM_CHAT_ID;

SynchoraBot.onText(/\/start/, (msg) => {
  SynchoraBot.sendMessage(
    msg.chat.id,
    `Welcome to Synchora

Synchora is an AI assistant designed to work with the Synchora wearable band, helping users manage daily activities through voice commands and intelligent assistance.

This bot allows direct messaging to Synchora's assistive agent via Telegram.

Use the commands below to explore:
• /info — Learn more about the project

Created by Sonu Chowdhury  
GitHub: https://github.com/SonuuChowdhury 
Portfolio: https://portfolio-sonuuchowdhury.vercel.app`,
    { parse_mode: "Markdown" }
  );
});

SynchoraBot.onText(/\/info/, (msg) => {
  SynchoraBot.sendMessage(
    msg.chat.id,
    `Synchora Project Information

Synchora is an AI agent designed to assist users with daily tasks and activities through voice commands or text-based interactions.

Core Capabilities:
• Voice command recognition  
• Task and reminder management  
• Calendar synchronization  
• Accessibility-focused interaction for users with special needs  
• Smart assistance for daily activities

Developer:
• Sonu Chowdhury — Project Lead & System Developer   

GitHub: https://github.com/SonuuChowdhury 
Portfolio: https://portfolio-sonuuchowdhury.vercel.app`,
    { parse_mode: "Markdown" }
  );
});

SynchoraBot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;
  const chatID = msg.chat.id;
  const text = msg.text;

  if (configuredChatID && chatID.toString() !== configuredChatID.toString()) {
    log.warn(`Unauthorized Telegram message from chat ID ${chatID}`);
    SynchoraBot.sendMessage(
      chatID,
      "Unauthorized user.\n\nThis bot is privately configured and cannot be used directly.\n\nSetup instructions available at:\nhttps://github.com/SonuuChowdhury/synchora-MS",
      { parse_mode: "HTML" }
    );
    return;
  }

  log.info(`Telegram message received: "${text}"`);
  try {
    await SynchoraBot.sendChatAction(chatID, "typing");
    const typingInterval = setInterval(() => {
      SynchoraBot.sendChatAction(chatID, "typing");
    }, 4000);

    const response = await detectIntent(text, true);
    clearInterval(typingInterval);

    if (!response) {
      log.error(`No response generated for input: "${text}"`);
      SynchoraBot.sendMessage(
        chatID,
        "Sorry, an internal error occurred on the system. Please try again later."
      );
      return;
    }

    log.info(`Telegram response sent: "${response}"`);
    const containsHTML = /<\/?[a-z][\s\S]*>/i.test(response);
    if (containsHTML) {
      SynchoraBot.sendMessage(chatID, response, { parse_mode: "HTML" });
    } else {
      SynchoraBot.sendMessage(chatID, response);
    }
  } catch (error) {
    log.error("Error handling Telegram bot message:", error.message);
  }
});

export async function sendMessageToUser(message) {
  try {
    if (!configuredChatID) {
      throw new Error("TELEGRAM_CHAT_ID not defined in environment variables");
    }
    const containsHTML = /<\/?[a-z][\s\S]*>/i.test(message);
    if (containsHTML) {
      await SynchoraBot.sendMessage(configuredChatID, message, { parse_mode: "HTML" });
    } else {
      await SynchoraBot.sendMessage(configuredChatID, message);
    }
    log.info(`Message dispatched to Telegram user: "${message}"`);
  } catch (error) {
    log.error("Error sending Telegram message:", error.message);
  }
}