import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

bot.on("message", async (msg) => {

  const chatId = msg.chat.id;
  const text = msg.text;

  console.log("Message:", text);
  console.log("Chat ID:", chatId); //Here you will get your chat ID in the console, which you can use for future bot interactions.

  // your agent logic
  let response = "Agent received: " + text;

  bot.sendMessage(chatId, response);

});