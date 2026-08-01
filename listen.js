import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import detectIntent from "./src/assistant.tasks/tasks.chain/detect.intent.app.js";
import emergencyProtocol from "./src/assistant.tasks/tasks.chain/emergency.protocol.js";
import SaveTelemetry from "./src/db.tasks/telemetry.data.save.js";
import { transcribeWithGroq } from "./src/stt/groqStt.js";
import { generateEdgeTTS } from "./src/tts/edgeTts.js";
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
// AUDIO FILE STREAMER (Server-to-Device)
// Decodes MP3/WAV/audio files to 16kHz 16-bit mono PCM and streams over WebSocket
// ─────────────────────────────────────────────
function streamAudioFile(filePath, socket) {
  if (!fs.existsSync(filePath)) {
    console.warn("📌 " + chalk.yellow(`[AUDIO] Intro file not found: ${filePath}`));
    console.warn("📌 " + chalk.gray("       Place 'introduction.mp3' inside Synchora-MS/public/ directory."));
    return;
  }

  console.log("📌 " + chalk.cyan("[AUDIO] 🔊 Streaming introduction.mp3 to device..."));

  // Spawn ffmpeg to decode MP3 with real-time pacing (-re), +80% volume boost, and 16kHz stereo s16le PCM stream
  const ffmpeg = spawn("ffmpeg", [
    "-re",
    "-i", filePath,
    "-filter:a", "volume=1.8",
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "-ar", "16000",
    "-ac", "2",
    "pipe:1"
  ]);

  let packetBuffer = Buffer.alloc(0);
  const PACKET_SIZE = 1024; // 1 KB clean packets (16 ms audio per packet — prevents ESP32 RX buffer overflow & WDT resets)

  ffmpeg.stdout.on("data", (chunk) => {
    packetBuffer = Buffer.concat([packetBuffer, chunk]);

    while (packetBuffer.length >= PACKET_SIZE) {
      if (!socket || socket.readyState !== 1) break; // Stop if socket closed

      // Network backpressure protection — pause ffmpeg if network buffer fills up
      if (socket.bufferedAmount > 32 * 1024) {
        ffmpeg.stdout.pause();
        setTimeout(() => {
          if (ffmpeg.stdout) ffmpeg.stdout.resume();
        }, 20);
        break;
      }

      const sendPacket = packetBuffer.subarray(0, PACKET_SIZE);
      packetBuffer = packetBuffer.subarray(PACKET_SIZE);
      socket.send(sendPacket);
    }
  });

  ffmpeg.stdout.on("end", () => {
    if (packetBuffer.length > 0 && socket.readyState === 1) {
      socket.send(packetBuffer);
      packetBuffer = Buffer.alloc(0);
    }
  });

  ffmpeg.stderr.on("data", () => {}); // silence ffmpeg stderr

  ffmpeg.on("error", (err) => {
    console.warn("📌 " + chalk.yellow("[AUDIO] ffmpeg spawn failed — sending raw file buffer fallback:"), err.message);
    try {
      const rawBuffer = fs.readFileSync(filePath);
      if (socket.readyState === 1) {
        socket.send(rawBuffer);
      }
    } catch (e) {
      console.error("📌 " + chalk.red("[AUDIO] Fallback file read failed:"), e.message);
    }
  });
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
    let laptopMicProc = null;

    const startLaptopMic = () => {
      if (laptopMicProc) {
        try { laptopMicProc.kill("SIGKILL"); } catch(e){}
        laptopMicProc = null;
      }

      console.log(
        "📌 " +
          chalk.yellow(
            "🎙️ [SERVER] ESP32 Mic disabled (MIC_AVAILABLE=false). Recording audio from Laptop Microphone..."
          )
      );

      laptopMicProc = spawn("ffmpeg", [
        "-y",
        "-f", "dshow",
        "-i", "audio=Microphone Array (Realtek High Definition Audio)",
        "-f", "s16le",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "pipe:1"
      ]);

      laptopMicProc.stdout.on("data", (chunk) => {
        audioBuffer = Buffer.concat([audioBuffer, chunk]);
      });

      laptopMicProc.on("error", (err) => {
        console.warn("📌 " + chalk.yellow("[LAPTOP MIC] ffmpeg device spawn failed — trying default dshow device:"), err.message);
        laptopMicProc = spawn("ffmpeg", [
          "-y",
          "-f", "dshow",
          "-i", "audio=default",
          "-f", "s16le",
          "-acodec", "pcm_s16le",
          "-ar", "16000",
          "-ac", "1",
          "pipe:1"
        ]);
        laptopMicProc.stdout.on("data", (chunk) => {
          audioBuffer = Buffer.concat([audioBuffer, chunk]);
        });
      });
    };

    const stopLaptopMic = () => {
      if (laptopMicProc) {
        try { laptopMicProc.kill("SIGINT"); } catch(e){}
        laptopMicProc = null;
        console.log("📌 " + chalk.yellow("🎙️ [SERVER] Laptop Microphone recording stopped."));
      }
    };

    const reset = () => {
      recording = false;
      stopLaptopMic();
      audioBuffer = Buffer.alloc(0);
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const endCommand = (reason) => {
      if (!recording) return;
      recording = false;
      stopLaptopMic();
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

      // ── Play Intro Audio Request ──
      if (data.event === "PLAY_INTRO") {
        const hour = new Date().getHours();
        let greeting = "Good evening";
        if (hour >= 4 && hour < 12) {
          greeting = "Good morning";
        } else if (hour >= 12 && hour < 17) {
          greeting = "Good afternoon";
        }
        const introText = `${greeting}, Synchora is now ready. How may I help you today?`;
        console.log("📌 " + chalk.cyan(`[PLAY_INTRO] Generating greeting TTS: "${introText}"`));
        try {
          await runTTS(introText, socket);
        } catch (err) {
          console.warn("📌 " + chalk.yellow("[PLAY_INTRO] TTS greeting failed — falling back to static introduction.mp3:"), err.message);
          const introPath = path.join(process.cwd(), "public", "introduction.mp3");
          streamAudioFile(introPath, socket);
        }
        return;
      }

      // ── Voice recording start ──
      if (data.event === "START") {
        reset();
        recording = true;
        console.log("📌 " + chalk.magenta("Recording started"));

        if (process.env.MIC_AVAILABLE === "false") {
          startLaptopMic();
        }

        timer = setTimeout(() => {
          endCommand("timeout");
        }, MAX_SEC * 1000);
        return;
      }

      // ── Voice recording end ──
      if (data.event === "END") {
        if (process.env.MIC_AVAILABLE === "false") {
          stopLaptopMic();
        }
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
    runTTS(result, socket);
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

  // Validate Token before processing
  const valid = ValidateToken(socket.userId);
  if (!valid) {
    console.log("❌ [STT] Invalid token or unauthorized user, userId:", socket.userId);
    socket.send("❌ Unauthorized device token");
    return;
  }

  // ⚡ TASK 2: Groq Whisper API (Fast ~150ms Speech Recognition)
  if (process.env.GROQ_API_KEY) {
    try {
      console.log("📌 " + chalk.cyan("[STT] ⚡ Transcribing with Groq Whisper API (whisper-large-v3-turbo)..."));
      const text = await transcribeWithGroq(pcmBuffer);
      console.log(`📌 [STT] ✅ Recognized text: "${text}"`);
      if (text) {
        DetectIntentOfText(text, socket);
      } else {
        console.warn("📌 [STT] ⚠️ Empty speech recognized.");
        socket.send("📌 Speech not understood");
      }
      return;
    } catch (err) {
      console.warn("📌 " + chalk.yellow("[STT] Groq STT failed — falling back to Python STT script:"), err.message);
    }
  }

  // Fallback: Python STT process
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

      if (result && result.success) {
        console.log(`📌 [STT] Recognized text: "${result.text}"`);
        DetectIntentOfText(result.text, socket);
      } else if (result && !result.success) {
        console.log(`❌ [STT] STT failed: ${result.error}`);
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
// TTS PIPELINE (Microsoft Edge Neural TTS — 100% Free, Zero Noise, High Speed)
// ─────────────────────────────────────────────
export async function runTTS(text, socket) {
  if (!text) return;
  console.log("📌 " + chalk.cyan("[TTS] ⚡ Synthesizing response with Microsoft Edge Neural TTS (Free & Unlimited)..."));
  
  // Notify device that TTS speech response stream is starting
  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({ event: "TTS_START", text: text }));
  }

  try {
    const voice = process.env.TTS_VOICE || "en-IN-NeerjaNeural";
    const mp3Path = await generateEdgeTTS(text, voice);
    streamAudioFile(mp3Path, socket);

    // Clean up temporary MP3 file after streaming completes
    setTimeout(() => {
      try {
        if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
      } catch (e) {}
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({ event: "TTS_END", success: true }));
      }
    }, 12000);
  } catch (err) {
    console.error("📌 ❌ [TTS] Edge-TTS synthesis error:", err.message);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ event: "TTS_END", success: false }));
    }
  }
}