import express from "express";
import http from "http";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";

import { errorHandler } from "./src/middlewares/error.middleware.js";
import {listen} from "./listen.js";
import router from "./src/routes/routes.js";
import connectDB from "./src/db/mongoose.connect.db.js";
import './src/bot/telegram.bot.js';

dotenv.config();
const token = process.env.TELEGRAM_BOT_TOKEN;

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

server.listen(PORT, () => {
  listen(server);
  connectDB()
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
