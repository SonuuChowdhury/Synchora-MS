import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import morgan from "morgan";
import figlet from "figlet";
import chalk from "chalk";
import boxen from "boxen";

import { errorHandler } from "./src/middlewares/error.middleware.js";
import { listen, runTTS, getActiveSocket } from "./listen.js";
import router from "./src/routes/routes.js";
import connectDB from "./src/db/mongoose.connect.db.js";
import './src/bot/telegram.bot.js';
import redisClient from "./src/config/redis.config.js";
import { startReminderService } from "./src/services/reminder.service.js";

import createLogger from "./src/utils/logger.js";

const log = createLogger("SERVER");

const app = express();
const server = http.createServer(app);

/* ===============================
   GLOBAL MIDDLEWARES
================================ */
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/", router);

/* ===============================
   ERROR HANDLER
================================ */
app.use(errorHandler);

/* ===============================
   SERVER START
================================ */
const PORT = process.env.PORT || 5000;

function showAgentIntro() {
  const logo = chalk.cyan(
    figlet.textSync("Synchora", { horizontalLayout: "default" })
  );
  console.log(logo);

  const info = `
${chalk.bold("AI Automation Agent")}

Status                : Running
GitHub Repository     : https://github.com/SonuuChowdhury/Synchora-MS
Web Site              : https://synchora-seven.vercel.app
Developer             : Sonu Chowdhury
Developer Portfolio   : https://portfolio-sonuuchowdhury.vercel.app
Support               : chowdhurysonu047@gmail.com

Synchora automates workflows, scraping, and intelligent task orchestration.
`;

  console.log(
    boxen(info, {
      padding: 0.5,
      margin: 0.5,
      borderStyle: "round",
      borderColor: "cyan"
    })
  );
}

server.listen(PORT, async () => {
  showAgentIntro();
  log.info("Initializing Agent server...");

  await connectDB();
  log.info("MongoDB connected successfully");

  try {
    await redisClient.connect();
    log.info("Redis connected successfully");
  } catch {
    log.warn("Redis unavailable, continuing without cache");
  }

  listen(server);
  log.info("WebSocket listener service started");

  // Start proactive reminder service (polls every 60s for upcoming events)
  startReminderService(runTTS, getActiveSocket);
  log.info("Reminder service started");

  log.info(`Server running at http://localhost:${PORT}`);
});