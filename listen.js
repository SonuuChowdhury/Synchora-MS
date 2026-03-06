import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import detectIntent from "./src/assistant.tasks/detect.intent.app.js";
import dotenv from "dotenv";

dotenv.config();

const SAMPLE_RATE = 16000;
const BYTES_PER_SEC = SAMPLE_RATE * 2;
const MAX_SEC = 30;
const MAX_BYTES = BYTES_PER_SEC * MAX_SEC;
const MIN_BYTES = BYTES_PER_SEC * 0.3;

export function listen(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    console.log("USer connected via websocket protocol");

    let recording = false;
    let audioBuffer = Buffer.alloc(0);
    let timer = null;

    const reset = () => {
      recording = false;
      audioBuffer = Buffer.alloc(0);
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const endCommand = (reason) => {
      if (!recording) return;
      recording = false;
      if (timer) clearTimeout(timer);

      console.log("🛑 Command ended:", reason);
      console.log("📦 Audio bytes:", audioBuffer.length);

      if (audioBuffer.length >= MIN_BYTES) {
        runSTT(audioBuffer, socket);
      } else {
        socket.send("⚠️ Command too short");
      }

      audioBuffer = Buffer.alloc(0);
    };

    socket.on("message", (msg, isBinary) => {
      // ===== CONTROL =====
      if (!isBinary) {
        try {
          const data = JSON.parse(msg.toString());
          console.log("CTRL:", data);

          if (data.event === "START") {
            reset();
            recording = true;
            console.log("▶ Recording started");

            timer = setTimeout(() => {
              endCommand("timeout");
            }, MAX_SEC * 1000);
          }

          if (data.event === "TOKEN") {
            if (!data.user_id || typeof data.user_id !== "string") {
              console.warn("Invalid user_id token");
              return;
            }

            socket.userId = data.user_id;
            console.log("👤 User identified:", socket.userId);
            return;
          }

          if (data.event === "END") {
            endCommand("button_release");
          }
        } catch {}
        return;
      }

      // ===== AUDIO =====
      if (!recording) return;

      audioBuffer = Buffer.concat([audioBuffer, Buffer.from(msg)]);

      if (audioBuffer.length >= MAX_BYTES) {
        endCommand("max_length");
      }
    });

    socket.on("close", () => {
      console.log("❌ Mic disconnected");
      endCommand("disconnect");
    });
  });
}

async function DetectIntentOfText(text, userID, socket) {
  try {
    //Here the detect intent function is internally handelling intent detection + command execution + storing agenitc memory and then returning the final text which should be converted to speech and sent back to the user device
    const result = await detectIntent(text, userID);
    if(!result){
      console.error("No result from App side.");
    }
    console.log("Synchora Said:", result)
    // runTTS(result, socket);
  } catch (err) {
    console.error("Error in starting the intent detection process:", err);
  }
}

function ValidateToken(userID){
  //this will verify the request is only coming from the device only
  if (!userID) {
    return false;
  }
  const DeviceToken = process.env.DEVICE_ID;
  if(!DeviceToken){
    console.error("❌ DEVICE_ID not set in environment variables");
  }
  return userID == DeviceToken;
}

async function runSTT(pcmBuffer, socket) {
  const py = spawn("python", ["src/stt/stt.py"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  let errored = false;

  py.on("error", (err) => {
    errored = true;
    console.error("❌ Python spawn failed:", err.message);
    socket.send("❌ Python not available");
  });

  py.stderr.on("data", (e) => {
    console.error("PY ERR:", e.toString());
  });

  py.stdout.on("data", (d) => {
    output += d.toString();
  });

  py.on("close", (code) => {
    if (errored) return;

    if (!output.trim()) {
      socket.send("❌ STT failed");
      return;
    }

    try {
      const result = JSON.parse(output);
      console.log("STT Result:", result);
      if (result) {
        const valid = ValidateToken(socket.userId)
        if (valid && result.success){
          DetectIntentOfText(result.text, socket.userId, socket);
        }else{
          console.log("❌ Invalid command or missing user token");
          return;
        }
      } else {
        console.log("❌ " + result.error);
      }
    } catch {
      console.error("❌ STT parse error");
    }
  });

  // 🚨 CRITICAL: only write if process is alive
  if (!errored) {
    py.stdin.write(pcmBuffer);
    py.stdin.end();
  }
}

export function runTTS(text, socket) {
  const py = spawn("python", ["src/tts/tts.py"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  py.stdin.write(text);
  py.stdin.end();

  py.stdout.on("data", (chunk) => {
    // 🔴 Send raw PCM bytes to ESP32
    socket.send(chunk, { binary: true });
  });

  py.stderr.on("data", (err) => {
    console.error("TTS ERR:", err.toString());
  });

  py.on("close", () => {
    // Optional end marker
    socket.send(JSON.stringify({ event: "TTS_END" }));
  });
}
