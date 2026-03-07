import SynchoraBot from "../config/bot.config.js";

import dotenv from "dotenv";
dotenv.config({ quiet: true });

const userID =  process.env.TELEGRAM_CHAT_ID;

SynchoraBot.onText(/\/start/, (msg) => {
  SynchoraBot.sendMessage(msg.chat.id,
`👋 Welcome to *Synchora*

Synchora is an AI assistant designed to work with the Synchora wearable band, helping users manage daily activities through voice commands and intelligent assistance.

But the bot you are interacting is build for the purpose of communicating synchora's assistive agent via telegram.

Use the commands below to explore:
• /info — Learn more about the project

Created by *Sonu Chowdhury*  
🔗 GitHub: https://github.com/SonuuChowdhury 
🌐 Portfolio: https://portfolio-sonuuchowdhury.vercel.app`,
{ parse_mode: "Markdown" });
});

SynchoraBot.onText(/\/info/, (msg) => {
  SynchoraBot.sendMessage(msg.chat.id,
`ℹ️ *Synchora Project Information*

Synchora is an AI agent designed to assist users with daily tasks and activities through voice commands or text-based interactions.

*Core Capabilities*
• Voice command recognition  
• Task and reminder management  
• Calendar synchronization  
• Accessibility-focused interaction for users with special needs  
• Smart assistance for daily activities
• And many more features in development!

*Developer*
• Sonu Chowdhury — Project Lead & System Developer   

For source code and documentation:

🔗 GitHub: https://github.com/SonuuChowdhury 
🌐 Portfolio: https://portfolio-sonuuchowdhury.vercel.app`,
{ parse_mode: "Markdown" });
});

SynchoraBot.on("message", async (msg) => {
  if (msg.text.startsWith("/")) return; // Ignore commands
  const chatId = msg.chat.id;
  const text = msg.text;

  if (chatId.toString() !== userID) {
  SynchoraBot.sendMessage(
    chatId,
    "❌ Unauthorized user.\n\nThis bot is privately configured and cannot be used directly.\n\nIf you want to use it, please deploy your own instance by following the setup instructions in the GitHub repository below:\n\n🔗 https://github.com/SonuuChowdhury/synchora-MS",
    { parse_mode: "HTML" }
  );
  return;
}

  console.log("Message:", text);
  console.log("Chat ID:", chatId);

  // your agent logic
  let response = "Agent received: " + text;

  SynchoraBot.sendMessage(chatId, response);

});

