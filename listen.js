import { WebSocketServer } from "ws";
import { spawn } from "child_process";
import detectIntent from "./src/assistant.tasks/tasks.chain/detect.intent.app.js";
import emergencyProtocol from "./src/assistant.tasks/tasks.chain/emergency.protocol.js";
import SaveTelemetry from "./src/db.tasks/telemetry.data.save.js";
import { transcribeWithGroq } from "./src/stt/groqStt.js";
import { generateEdgeTTS } from "./src/tts/edgeTts.js";
import { getRandomFiller } from "./src/utils/fillerPhrases.js";
import { guessIntentFromKeywords } from "./src/utils/intentKeywords.js";
import { selectVoiceForText } from "./src/utils/languageDetector.js";
import createLogger from "./src/utils/logger.js";
import { TTS_END_BUFFER_MS } from "./src/config/constants.js";
import fs from "fs";
import path from "path";

const log = createLogger("LISTEN");

const SAMPLE_RATE = 16000;
const BYTES_PER_SEC = SAMPLE_RATE * 2;
const MAX_SEC = 30;
const MAX_BYTES = BYTES_PER_SEC * MAX_SEC;
const MIN_BYTES = BYTES_PER_SEC * 0.3;

// ─────────────────────────────────────────────
// TELEMETRY HANDLER
// ─────────────────────────────────────────────
async function handleTelemetry(data, socket) {
  const { temperature, humidity, latitude, longitude } = data;

  if (
    temperature === undefined ||
    humidity === undefined ||
    latitude === undefined ||
    longitude === undefined
  ) {
    log.warn(`Telemetry missing required fields: ${JSON.stringify(data)}`);
    socket.send(
      JSON.stringify({ event: "TELEMETRY_ACK", success: false, reason: "missing_fields" })
    );
    return;
  }

  log.info(`Incoming telemetry: Temp=${temperature}°C  Humidity=${humidity}%  Lat=${latitude}  Lng=${longitude}`);

  try {
    const result = await SaveTelemetry({ temperature, humidity, latitude, longitude });

    if (result.success) {
      log.info(`Telemetry data saved successfully (ID: ${result.data?._id})`);
      socket.send(JSON.stringify({ event: "TELEMETRY_ACK", success: true }));
    } else {
      log.error(`Telemetry save failed: ${result.error}`);
      socket.send(
        JSON.stringify({ event: "TELEMETRY_ACK", success: false, reason: result.error })
      );
    }
  } catch (err) {
    log.error("Unexpected error during telemetry save:", err.message);
    socket.send(
      JSON.stringify({ event: "TELEMETRY_ACK", success: false, reason: "internal_error" })
    );
  }
}

// ─────────────────────────────────────────────
// CONTINUOUS BILINGUAL EMERGENCY ANNOUNCEMENT LOOP
// ─────────────────────────────────────────────
const EMERGENCY_ANNOUNCEMENT_EN = "Emergency system is activated. Please stay calm and wait until assistance arrives.";
const EMERGENCY_ANNOUNCEMENT_HI = "आपातकालीन सेवा सक्रिय कर दी गई है। कृपया शांत रहें और सहायता पहुँचने तक प्रतीक्षा करें।";

async function startEmergencyLoop(socket) {
  if (socket.isEmergencyLoopActive) return;
  socket.isEmergencyLoopActive = true;
  log.warn("Starting continuous bilingual Emergency SOS announcement loop");

  let useHindi = false;
  while (socket.isEmergencyLoopActive && socket.readyState === 1) {
    const text = useHindi ? EMERGENCY_ANNOUNCEMENT_HI : EMERGENCY_ANNOUNCEMENT_EN;
    useHindi = !useHindi;

    try {
      await runTTS(text, socket);
      for (let i = 0; i < 15; i++) {
        if (!socket.isEmergencyLoopActive || socket.readyState !== 1) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch (err) {
      log.error("Emergency announcement loop error:", err.message);
      break;
    }
  }
  log.info("Emergency SOS announcement loop ended");
}

function stopEmergencyLoop(socket) {
  if (socket.isEmergencyLoopActive) {
    socket.isEmergencyLoopActive = false;
    log.info("Emergency SOS announcement loop stopped");
  }
}

// ─────────────────────────────────────────────
// DIRECT EMERGENCY HANDLER
// ─────────────────────────────────────────────
async function handleDirectEmergency(socket) {
  log.warn("Direct hardware emergency button trigger received");
  socket.send(JSON.stringify({ event: "EMERGENCY_ACK", received: true }));

  try {
    await emergencyProtocol();
    log.info("Emergency protocol executed — Telegram alert dispatched");
    socket.send(JSON.stringify({ event: "EMERGENCY_ACK", dispatched: true }));
  } catch (err) {
    log.error("Emergency protocol failed:", err.message);
    socket.send(
      JSON.stringify({ event: "EMERGENCY_ACK", dispatched: false, reason: err.message })
    );
  }
}

// ─────────────────────────────────────────────
// AUDIO FILE STREAMER (Server-to-Device)
// ─────────────────────────────────────────────
function streamAudioFile(filePath, socket) {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      log.warn(`Audio file not found: ${filePath}`);
      return resolve(0);
    }

    log.info(`Streaming audio file to device: ${path.basename(filePath)}`);

    const ffmpeg = spawn("ffmpeg", [
      // NOTE: No -re flag here — stream as fast as possible so the ESP32
      // jitter buffer fills immediately. The ESP32 ring buffer controls
      // playback pacing; real-time throttling on the server causes starvation.
      "-i", filePath,
      "-filter:a", "volume=0.75",  // Cap at 0.75 to protect 0.25W/16Ω speakers at +9dB GAIN
      "-f", "s16le",
      "-acodec", "pcm_s16le",
      "-ar", "16000",
      "-ac", "1",  // MONO — matches MAX98357A mono amp; halves Wi-Fi bandwidth vs stereo
      "pipe:1"
    ]);

    let packetBuffer = Buffer.alloc(0);
    let totalBytesSent = 0;
    let resolved = false;
    // 4096-byte packets: reduces WebSocket frame count from 31/sec to 8/sec,
    // dramatically cutting TCP header overhead and burst-drop patterns on weak Wi-Fi.
    const PACKET_SIZE = 4096;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (packetBuffer.length > 0 && socket && socket.readyState === 1) {
        socket.send(packetBuffer);
        totalBytesSent += packetBuffer.length;
        packetBuffer = Buffer.alloc(0);
      }
      resolve(totalBytesSent);
    };

    ffmpeg.stdout.on("data", (chunk) => {
      packetBuffer = Buffer.concat([packetBuffer, chunk]);

      while (packetBuffer.length >= PACKET_SIZE) {
        if (!socket || socket.readyState !== 1) break;

        if (socket.bufferedAmount > 16 * 1024) {
          ffmpeg.stdout.pause();
          setTimeout(() => {
            if (ffmpeg.stdout) ffmpeg.stdout.resume();
          }, 20);
          break;
        }

        const sendPacket = packetBuffer.subarray(0, PACKET_SIZE);
        packetBuffer = packetBuffer.subarray(PACKET_SIZE);
        socket.send(sendPacket);
        totalBytesSent += sendPacket.length;
      }
    });

    ffmpeg.stdout.on("end", finish);
    ffmpeg.on("close", finish);
    ffmpeg.stderr.on("data", () => { });

    ffmpeg.on("error", (err) => {
      log.warn("ffmpeg spawn failed — sending raw file buffer fallback:", err.message);
      try {
        const rawBuffer = fs.readFileSync(filePath);
        if (socket && socket.readyState === 1) {
          socket.send(rawBuffer);
          totalBytesSent += rawBuffer.length;
        }
      } catch (e) {
        log.error("Fallback file read failed:", e.message);
      }
      finish();
    });
  });
}

// ─────────────────────────────────────────────
// MAIN WEBSOCKET LISTENER
// ─────────────────────────────────────────────

// Tracks the most recently connected device socket (for reminder TTS)
let activeSocket = null;
export function getActiveSocket() { return activeSocket; }

export function listen(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    log.info("Client connected via WebSocket protocol");
    activeSocket = socket;

    let recording = false;
    let audioBuffer = Buffer.alloc(0);
    let timer = null;
    let laptopMicProc = null;

    const startLaptopMic = () => {
      if (laptopMicProc) {
        try { laptopMicProc.kill("SIGKILL"); } catch (e) { }
        laptopMicProc = null;
      }

      log.info("ESP32 Mic disabled (MIC_AVAILABLE=false). Recording audio from Laptop Microphone...");

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
        log.warn("ffmpeg laptop mic device spawn failed — trying default dshow device:", err.message);
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
        try { laptopMicProc.kill("SIGINT"); } catch (e) { }
        laptopMicProc = null;
        log.info("Laptop Microphone recording stopped.");
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

      log.info(`Command recording ended: ${reason} (Audio bytes: ${audioBuffer.length})`);

      if (audioBuffer.length >= MIN_BYTES) {
        runSTT(audioBuffer, socket);
      } else {
        socket.send("Command audio too short");
      }

      audioBuffer = Buffer.alloc(0);
    };

    socket.on("message", async (msg, isBinary) => {
      if (isBinary) {
        if (!recording) return;
        audioBuffer = Buffer.concat([audioBuffer, Buffer.from(msg)]);
        if (audioBuffer.length >= MAX_BYTES) {
          endCommand("max_length");
        }
        return;
      }

      let data;
      try {
        data = JSON.parse(msg.toString());
      } catch {
        log.warn("Non-JSON text message received — ignoring");
        return;
      }

      log.debug("Control frame received:", data.event);

      if (data.event === "TOKEN") {
        if (!data.user_id || typeof data.user_id !== "string") {
          log.warn("Invalid or missing user_id in TOKEN event");
          return;
        }
        socket.userId = data.user_id;
        log.info(`User identified: ${socket.userId}`);
        return;
      }

      if (data.event === "PLAY_INTRO") {
        const hour = new Date().getHours();
        let greeting = "Good evening";
        if (hour >= 4 && hour < 12) {
          greeting = "Good morning";
        } else if (hour >= 12 && hour < 17) {
          greeting = "Good afternoon";
        }
        const introText = `${greeting}, Synchora is now ready. How may I help you today?`;
        log.info(`Generating greeting TTS: "${introText}"`);
        try {
          await runTTS(introText, socket);
        } catch (err) {
          log.warn("TTS greeting failed — falling back to static introduction.mp3:", err.message);
          const introPath = path.join(process.cwd(), "public", "introduction.mp3");
          streamAudioFile(introPath, socket);
        }
        return;
      }

      if (data.event === "START") {
        reset();
        recording = true;
        log.info("Voice recording started");

        if (process.env.MIC_AVAILABLE === "false") {
          startLaptopMic();
        }

        timer = setTimeout(() => {
          endCommand("timeout");
        }, MAX_SEC * 1000);
        return;
      }

      if (data.event === "END") {
        if (process.env.MIC_AVAILABLE === "false") {
          stopLaptopMic();
        }
        endCommand("button_release");
        return;
      }

      if (data.event === "CANCEL_SPEECH") {
        log.info("Audio barge-in interrupt received from device — active speech cancelled");
        return;
      }

      if (data.event === "TELEMETRY_UPDATE") {
        await handleTelemetry(data, socket);
        return;
      }

      if (data.event === "EMERGENCY_TRIGGER") {
        await handleDirectEmergency(socket);
        startEmergencyLoop(socket);
        return;
      }

      if (data.event === "EMERGENCY_CANCEL") {
        log.info("Device sent EMERGENCY_CANCEL event — stopping announcement loop");
        stopEmergencyLoop(socket);
        return;
      }

      log.warn(`Unknown event type received: ${data.event}`);
    });

    socket.on("close", () => {
      log.info("Client WebSocket disconnected");
      if (activeSocket === socket) activeSocket = null;
      stopEmergencyLoop(socket);
      endCommand("disconnect");
    });
  });
}

// ─────────────────────────────────────────────
// INTENT DETECTION ENTRY POINT WITH THINKING FILLERS
// ─────────────────────────────────────────────
export async function DetectIntentOfText(text, socket) {
  try {
    // Phase 3.1: Fire instant thinking filler phrase (bilingual awareness)
    const roughIntent = guessIntentFromKeywords(text);
    const fillerPhrase = getRandomFiller(roughIntent, text);

    if (fillerPhrase) {
      log.info(`STT Recognized: "${text}" (rough intent: ${roughIntent}) -> Triggering filler: "${fillerPhrase}"`);
      // MUST await here — without await, filler TTS and the main AI response TTS
      // both fire concurrently, sending two TTS_START events to the device and
      // racing two audio streams into the same ring buffer, causing garbled audio.
      await runTTS(fillerPhrase, socket);
    } else {
      log.info(`STT Recognized greeting/simple input: "${text}" -> Skipping filler, direct response`);
    }

    // Parallel execution of unified Gemini chain
    const result = await detectIntent(text);
    if (!result) {
      log.error("No result from processing pipeline");
      return;
    }
    log.info(`Synchora Response: "${result}"`);

    // Check if Emergency SOS was activated and trigger hardware alarm + loop on device
    if (socket && socket.readyState === 1 && /emergency/i.test(result)) {
      log.warn("Voice Emergency SOS detected — sending EMERGENCY_START event and starting announcement loop");
      socket.send(JSON.stringify({ event: "EMERGENCY_START" }));
      startEmergencyLoop(socket);
      return;
    }

    // Stream main AI response
    await runTTS(result, socket);
  } catch (err) {
    log.error("Error in intent detection processing:", err.message);
  }
}

// ─────────────────────────────────────────────
// TOKEN VALIDATION
// ─────────────────────────────────────────────
function ValidateToken(userID) {
  if (!userID) return false;
  const DeviceToken = process.env.DEVICE_ID;
  if (!DeviceToken) {
    log.error("DEVICE_ID not set in environment variables");
  }
  return userID === DeviceToken;
}

// ─────────────────────────────────────────────
// STT PIPELINE
// ─────────────────────────────────────────────
async function runSTT(pcmBuffer, socket) {
  const debugDir = "./debug_audio";
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
  const filename = `${debugDir}/audio_${Date.now()}.pcm`;
  fs.writeFileSync(filename, pcmBuffer);
  log.info(`Audio saved to ${filename} (${pcmBuffer.length} bytes)`);

  const valid = ValidateToken(socket.userId);
  if (!valid) {
    log.warn(`Unauthorized device token: ${socket.userId}`);
    socket.send("Unauthorized device token");
    return;
  }

  if (process.env.GROQ_API_KEY) {
    try {
      log.info("Transcribing audio buffer with Groq Whisper API (whisper-large-v3-turbo)...");
      const text = await transcribeWithGroq(pcmBuffer);
      log.info(`Recognized text: "${text}"`);
      if (text) {
        DetectIntentOfText(text, socket);
      } else {
        log.warn("Empty speech recognized");
        socket.send("Speech not understood");
      }
      return;
    } catch (err) {
      log.warn("Groq STT failed — falling back to Python STT script:", err.message);
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
    log.error("Python STT process spawn failed:", err.message);
    socket.send("Python STT unavailable");
  });

  py.stderr.on("data", (e) => {
    log.warn("Python STT stderr:", e.toString());
  });

  py.stdout.on("data", (d) => {
    output += d.toString();
  });

  py.on("close", (code) => {
    if (errored) return;

    if (!output.trim()) {
      log.error("Empty output from Python STT");
      socket.send("STT failed");
      return;
    }

    try {
      const result = JSON.parse(output);
      if (result && result.success) {
        log.info(`Recognized text (Python STT): "${result.text}"`);
        DetectIntentOfText(result.text, socket);
      } else if (result && !result.success) {
        log.error(`STT failed: ${result.error}`);
      }
    } catch (e) {
      log.error("JSON parse error from Python STT:", e.message);
    }
  });

  if (!errored) {
    py.stdin.write(pcmBuffer);
    py.stdin.end();
  }
}

// ─────────────────────────────────────────────
// TTS PIPELINE WITH ACCURATE DURATION CALCULATION & AUTO VOICE SELECTION
// ─────────────────────────────────────────────
export async function runTTS(text, socket) {
  if (!text) return;
  const voice = selectVoiceForText(text);
  log.info(`Synthesizing response with Edge-TTS (voice: ${voice}): "${text}"`);

  if (socket && socket.readyState === 1) {
    socket.send(JSON.stringify({ event: "TTS_START", text: text }));
  }

  try {
    const mp3Path = await generateEdgeTTS(text, voice);
    const bytesSent = await streamAudioFile(mp3Path, socket);

    // Calculate playback duration from byte count.
    // Mono PCM @ 16kHz 16-bit = 16000 × 2 = 32,000 bytes/sec.
    // (Previously used 64000 which was the stereo rate — caused TTS_END to fire
    // at half the correct time, cutting off the last word of every sentence.)
    // Add TTS_END_BUFFER_MS PLUS an extra 400ms drain window so the ESP32 jitter
    // buffer fully drains before setPlaybackActive(false) is called.
    const estimatedDurationMs = Math.ceil((bytesSent / 32000) * 1000) + TTS_END_BUFFER_MS + 400;
    const finalTimerMs = Math.max(estimatedDurationMs, 800);

    await new Promise((resolve) => {
      setTimeout(() => {
        try {
          if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
        } catch (e) { }
        if (socket && socket.readyState === 1) {
          socket.send(JSON.stringify({ event: "TTS_END", success: true }));
        }
        resolve();
      }, finalTimerMs);
    });

  } catch (err) {
    log.error("Edge-TTS synthesis error:", err.message);
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ event: "TTS_END", success: false }));
    }
  }
}