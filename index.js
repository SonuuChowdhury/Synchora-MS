import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import figlet from "figlet";
import chalk from "chalk";
import boxen from "boxen";

import { errorHandler } from "./src/middlewares/error.middleware.js";
import {listen} from "./listen.js";
import router from "./src/routes/routes.js";
import connectDB from "./src/db/mongoose.connect.db.js";
import './src/bot/telegram.bot.js';
import redisClient from "./src/config/redis.config.js";

dotenv.config({ quiet: true });
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

${chalk.green("Status")}                : Running
${chalk.magenta("GitHub Repository")}     : https://github.com/SonuuChowdhury/Synchora-MS
${chalk.yellow("Web Site")}              : https://synchora-seven.vercel.app
${chalk.cyan("Developer")}             : Sonu Chowdhury
${chalk.cyan("Developer Portfolio")}   : https://portfolio-sonuuchowdhury.vercel.app
${chalk.cyan("Support")}               : chowdhurysonu047@gmail.com

${chalk.gray("Synchora automates workflows, scraping, and intelligent task orchestration.")}
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
  console.log(chalk.blue("ℹ Initializing Agent...\n"));

  connectDB();
  console.log(chalk.green("✔ MongoDB connected"));

  await redisClient.connect();
  console.log(chalk.green("✔ Redis connected"));

  listen(server);
  console.log(chalk.green("✔ Socket service started"));

  console.log(
    chalk.yellow(`🚀 Server running at http://localhost:${PORT}\n`)
  );
});