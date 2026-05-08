import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import detectIntent from "./src/assistant.tasks/tasks.chain/detect.intent.app.js";
import emergencyProtocol from "./src/assistant.tasks/tasks.chain/emergency.protocol.js";
import SaveTelemetry from "./src/db.tasks/telemetry.data.save.js";
import dotenv from "dotenv";
import chalk from "chalk";
import fs from "fs";
import path from "path";

dotenv.config({ quiet: true });

const SAMPLE_RATE = 16000;
const BYTES_PER_SEC = SAMPLE_RATE * 2;
const MAX_SEC = 30;
const MAX_BYTES = BYTES_PER_SEC * MAX_SEC;
const MIN_BYTES = BYTES_PER_SEC * 0.3;

// ─────────────────────────────────────────────
// TELEMETRY HANDLER
// Called on TELEMETRY_UPDATE event from device
// Also auto-triggered every 60 seconds by device
// ─────────────────────────────────────────────
async function handleTelemetry(data, socket) {
  const { temperature, humidity, latitude, longitude } = data;

  // Validate required fields before saving
  if (
    temperature === undefined ||
    humidity === undefined ||
    latitude === undefined ||
    longitude === undefined
  ) {
    console.warn(
      "📌 " +
        chalk.yellow("[TELEMETRY] Missing required fields — skipping save.") +
        chalk.gray(` Received: ${JSON.stringify(data)}`)
    );
    socket.send(
      JSON.stringify({ event: "TELEMETRY_ACK", success: false, reason: "missing_fields" })
    );
    return;
  }

  console.log(
    "📌 " +
      chalk.cyan("[TELEMETRY] Incoming data from device:") +
      chalk.gray(
        ` Temp=${temperature}°C  Humidity=${humidity}%  Lat=${latitude}  Lng=${longitude}`
      )
  );

  try {
    const result = await SaveTelemetry({ temperature, humidity, latitude, longitude });

    if (result.success) {
      console.log(
        "📌 " + chalk.green("[TELEMETRY] Data saved successfully.") +
          chalk.gray(` ID: ${result.data?._id}`)
      );
      socket.send(JSON.stringify({ event: "TELEMETRY_ACK", success: true }));
    } else {
      console.error(
        "📌 " +
          chalk.red("[TELEMETRY] Save failed:") +
          " " +
          chalk.gray(result.error)
      );
      socket.send(
        JSON.stringify({ event: "TELEMETRY_ACK", success: false, reason: result.error })
      );
    }
  } catch (err) {
    console.error(
      "📌 " + chalk.red("[TELEMETRY] Unexpected error during save:"),
      err.message
    );
    socket.send(
      JSON.stringify({ event: "TELEMETRY_ACK", success: false, reason: "internal_error" })
    );
  }
}

// ─────────────────────────────────────────────
// DIRECT EMERGENCY HANDLER
// Called when device sends EMERGENCY_TRIGGER event
// (dedicated hardware button or fallback if voice fails)
// ─────────────────────────────────────────────
async function handleDirectEmergency(socket) {
  console.log(
    "\n" +
      chalk.bgRed.white.bold(" 🚨 [EMERGENCY] Direct hardware trigger received! ") +
      "\n"
  );

  // Acknowledge immediately so the device knows we got it
  socket.send(JSON.stringify({ event: "EMERGENCY_ACK", received: true }));

  try {
    await emergencyProtocol();
    console.log(
      "📌 " + chalk.green("[EMERGENCY] Protocol executed — Telegram alert dispatched.")
    );
    socket.send(JSON.stringify({ event: "EMERGENCY_ACK", dispatched: true }));
  } catch (err) {
    console.error(
      "📌 " + chalk.red("[EMERGENCY] Protocol failed:"),
      err.message
    );
    socket.send(
      JSON.stringify({ event: "EMERGENCY_ACK", dispatched: false, reason: err.message })
    );
  }
}

// ─────────────────────────────────────────────
// MAIN WEBSOCKET LISTENER
// ─────────────────────────────────────────────
export function listen(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    console.log(
      "📌 " +
        chalk.magenta("User connected via synchora device (websocket protocol)")
    );

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

      console.log("📌 " + chalk.magenta("Command ended: ") + reason);
      console.log("📌 " + chalk.magenta("Audio bytes: ") + audioBuffer.length);

      if (audioBuffer.length >= MIN_BYTES) {
        runSTT(audioBuffer, socket);
      } else {
        socket.send("📌 Command too short");
      }

      audioBuffer = Buffer.alloc(0);
    };

    socket.on("message", async (msg, isBinary) => {

      // ─── BINARY: raw PCM audio chunks ───
      if (isBinary) {
        if (!recording) return;
        audioBuffer = Buffer.concat([audioBuffer, Buffer.from(msg)]);
        if (audioBuffer.length >= MAX_BYTES) {
          endCommand("max_length");
        }
        return;
      }

      // ─── TEXT: JSON control frames ───
      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        console.warn("📌 " + chalk.yellow("[WS] Non-JSON text message received — ignoring."));
        return;
      }

      console.log("📌 " + chalk.magenta("CTRL:"), data);

      // ── Auth token ──
      if (data.event === "TOKEN") {
        if (!data.user_id || typeof data.user_id !== "string") {
          console.warn("📌 " + chalk.yellow("[WS] Invalid or missing user_id in TOKEN event."));
          return;
        }
        socket.userId = data.user_id;
        console.log(
          "📌 " + chalk.magenta("User identified:") + " " + chalk.cyan(socket.userId)
        );
        return;
      }

      // ── Voice recording start ──
      if (data.event === "START") {
        reset();
        recording = true;
        console.log("📌 " + chalk.magenta("Recording started"));
        timer = setTimeout(() => {
          endCommand("timeout");
        }, MAX_SEC * 1000);
        return;
      }

      // ── Voice recording end ──
      if (data.event === "END") {
        endCommand("button_release");
        return;
      }

      // ── Telemetry update from device ──
      // Sent on connection startup and then every ~60 seconds automatically
      // Payload: { event: "TELEMETRY_UPDATE", temperature, humidity, latitude, longitude }
      if (data.event === "TELEMETRY_UPDATE") {
        console.log(
          "📌 " + chalk.cyan("[TELEMETRY] Update event received from device.")
        );
        await handleTelemetry(data, socket);
        return;
      }

      // ── Direct emergency trigger from dedicated hardware button ──
      // Used as fallback when voice command is unavailable or fails
      // Payload: { event: "EMERGENCY_TRIGGER" }
      if (data.event === "EMERGENCY_TRIGGER") {
        console.log(
          "📌 " +
            chalk.bgRed.white("[EMERGENCY] Hardware button trigger event received.")
        );
        await handleDirectEmergency(socket);
        return;
      }

      // ── Unknown event ──
      console.warn(
        "📌 " +
          chalk.yellow("[WS] Unknown event type received:") +
          " " +
          chalk.gray(data.event)
      );
    });

    socket.on("close", () => {
      console.log("📌 " + chalk.magenta("Mic disconnected"));
      endCommand("disconnect");
    });
  });
}

// ─────────────────────────────────────────────
// INTENT DETECTION ENTRY POINT
// ─────────────────────────────────────────────
export async function DetectIntentOfText(text, socket) {
  try {
    const result = await detectIntent(text);
    if (!result) {
      console.error("📌 No result from App side.");
      return;
    }
    console.log("📌 " + chalk.magenta("Synchora Said:"), result, "\n\n");
    // runTTS(result, socket);
  } catch (err) {
    console.error("Error in starting the intent detection process:", err);
  }
}

// ─────────────────────────────────────────────
// TOKEN VALIDATION
// ─────────────────────────────────────────────
function ValidateToken(userID) {
  if (!userID) return false;
  const DeviceToken = process.env.DEVICE_ID;
  if (!DeviceToken) {
    console.error("📌 DEVICE_ID not set in environment variables");
  }
  return userID === DeviceToken;
}

// ─────────────────────────────────────────────
// STT PIPELINE
// ─────────────────────────────────────────────
async function runSTT(pcmBuffer, socket) {
  // Save raw PCM for debugging
  const debugDir = "./debug_audio";
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
  const filename = `${debugDir}/audio_${Date.now()}.pcm`;
  fs.writeFileSync(filename, pcmBuffer);
  console.log(
    `📌 [STT] Audio saved to ${filename} ` +
      chalk.gray(
        `(${pcmBuffer.length} bytes, ~${(pcmBuffer.length / (16000 * 2)).toFixed(2)}s)`
      )
  );

  console.log(`📌 [STT] Starting STT process...`);
  console.log(`📌 [STT] Buffer size: ${pcmBuffer.length} bytes`);
  console.log(`📌 [STT] Socket userId: ${socket.userId}`);

  const py = spawn("python", ["src/stt/stt.py"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  let errored = false;

  py.on("error", (err) => {
    errored = true;
    console.error("📌 [STT] Python spawn failed:", err.message);
    socket.send("📌 Python not available");
  });

  py.stderr.on("data", (e) => {
    console.error("📌 [STT] Python stderr:", e.toString());
  });

  py.stdout.on("data", (d) => {
    output += d.toString();
    console.log("📌 [STT] Python stdout chunk received");
  });

  py.on("close", (code) => {
    console.log(`📌 [STT] Python process closed with code: ${code}`);
    console.log(`📌 [STT] Raw output: "${output.trim()}"`);

    if (errored) return;

    if (!output.trim()) {
      console.error("📌 [STT] Empty output from Python");
      socket.send("📌 STT failed");
      return;
    }

    try {
      const result = JSON.parse(output);
      console.log("📌 [STT] Parsed result:", result);

      if (result) {
        const valid = ValidateToken(socket.userId);
        console.log(`📌 [STT] Token valid: ${valid}, userId: ${socket.userId}`);

        if (!valid) {
          console.log("❌ [STT] Invalid token, userId:", socket.userId);
        }

        if (valid && result.success) {
          console.log(`📌 [STT] Recognized text: "${result.text}"`);
          DetectIntentOfText(result.text, socket);
        } else if (valid && !result.success) {
          console.log(`❌ [STT] STT failed: ${result.error}`);
        } else {
          console.log("❌ [STT] Invalid command or missing user token");
        }
      } else {
        console.log("❌ [STT] Null result from STT");
      }
    } catch (e) {
      console.error("❌ [STT] JSON parse error:", e.message);
      console.error("❌ [STT] Raw output was:", output);
    }
  });

  if (!errored) {
    console.log("📌 [STT] Writing PCM buffer to Python stdin...");
    py.stdin.write(pcmBuffer);
    py.stdin.end();
    console.log("📌 [STT] PCM buffer written, stdin closed");
  }
}

// ─────────────────────────────────────────────
// TTS PIPELINE
// ─────────────────────────────────────────────
export function runTTS(text, socket) {
  const py = spawn("python", ["src/tts/tts.py"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  py.stdin.write(text);
  py.stdin.end();

  py.stdout.on("data", (chunk) => {
    socket.send(chunk, { binary: true });
  });

  py.stderr.on("data", (err) => {
    console.error("TTS ERR:", err.toString());
  });

  py.on("close", () => {
    socket.send(JSON.stringify({ event: "TTS_END" }));
  });
}