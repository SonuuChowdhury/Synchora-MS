import chalk from "chalk";

/**
 * Centralized Logger for Synchora Microservice
 * Provides formatted, color-coded, level-gated console output with IST timestamps.
 * 
 * Usage:
 *   import createLogger from "../utils/logger.js";
 *   const log = createLogger("STT");
 *   log.info("Transcription completed");
 *   log.warn("High latency detected");
 *   log.error("Failed to process request", err);
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

function getMinLogLevel() {
  const envLevel = (process.env.LOG_LEVEL || "").toLowerCase();
  if (LOG_LEVELS[envLevel] !== undefined) {
    return LOG_LEVELS[envLevel];
  }
  return process.env.NODE_ENV === "production" ? LOG_LEVELS.warn : LOG_LEVELS.debug;
}

function getFormattedTime() {
  const now = new Date();
  // Adjust to IST (UTC + 5:30)
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  
  const hours = String(istDate.getUTCHours()).padStart(2, "0");
  const minutes = String(istDate.getUTCMinutes()).padStart(2, "0");
  const seconds = String(istDate.getUTCSeconds()).padStart(2, "0");
  const ms = String(istDate.getUTCMilliseconds()).padStart(3, "0");
  
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

export default function createLogger(namespace = "APP") {
  const minLevel = getMinLogLevel();
  const nsTag = `[${namespace.toUpperCase()}]`;

  return {
    debug(...args) {
      if (minLevel <= LOG_LEVELS.debug) {
        console.log(chalk.gray(`${getFormattedTime()} [DEBUG] ${nsTag}`), ...args);
      }
    },
    info(...args) {
      if (minLevel <= LOG_LEVELS.info) {
        console.log(chalk.cyan(`${getFormattedTime()} [INFO] `) + chalk.magenta(nsTag), ...args);
      }
    },
    warn(...args) {
      if (minLevel <= LOG_LEVELS.warn) {
        console.warn(chalk.yellow(`${getFormattedTime()} [WARN]  ${nsTag}`), ...args);
      }
    },
    error(...args) {
      if (minLevel <= LOG_LEVELS.error) {
        console.error(chalk.red(`${getFormattedTime()} [ERROR] ${nsTag}`), ...args);
      }
    }
  };
}
