import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) {
        console.warn("⚠ Redis: max reconnect attempts reached, giving up.");
        return false; // stop retrying
      }
      return Math.min(retries * 500, 3000);
    }
  }
});

let errorLogged = false;

redisClient.on("error", (err) => {
  if (!errorLogged) {
    console.error("Redis Error:", err);
    errorLogged = true;
  }
});

redisClient.on("connect", () => {
  errorLogged = false; // reset on reconnect
});

export default redisClient;