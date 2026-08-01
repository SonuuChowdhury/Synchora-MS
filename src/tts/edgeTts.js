import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * 100% FREE Microsoft Edge Neural TTS Engine via official edge-tts python module
 * Generates crystal-clear 1.0x neural speech MP3 in ~200ms
 * Voices: 'en-IN-NeerjaNeural' (Indian Female), 'en-IN-PrabhatNeural' (Indian Male), 'en-US-AvaNeural'
 */
export function generateEdgeTTS(text, voice = process.env.TTS_VOICE || "en-IN-NeerjaNeural") {
  const tempDir = "./temp_tts";
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  const mp3Path = path.join(process.cwd(), tempDir, `tts_${Date.now()}.mp3`);

  return new Promise((resolve, reject) => {
    // Attempt 1: Run edge-tts command directly
    const proc = spawn("edge-tts", [
      "--voice", voice,
      "--text", text,
      "--write-media", mp3Path
    ]);

    let errored = false;

    proc.on("error", () => {
      errored = true;
      // Fallback: Run python -m edge_tts
      const pyProc = spawn("python", [
        "-m", "edge_tts",
        "--voice", voice,
        "--text", text,
        "--write-media", mp3Path
      ]);

      pyProc.on("close", (code) => {
        if (code === 0 && fs.existsSync(mp3Path)) {
          resolve(mp3Path);
        } else {
          reject(new Error(`python -m edge_tts failed with code ${code}`));
        }
      });

      pyProc.on("error", (err2) => {
        reject(err2);
      });
    });

    proc.on("close", (code) => {
      if (errored) return;
      if (code === 0 && fs.existsSync(mp3Path)) {
        resolve(mp3Path);
      } else {
        // Fallback to python -m edge_tts
        const pyProc = spawn("python", [
          "-m", "edge_tts",
          "--voice", voice,
          "--text", text,
          "--write-media", mp3Path
        ]);

        pyProc.on("close", (pyCode) => {
          if (pyCode === 0 && fs.existsSync(mp3Path)) {
            resolve(mp3Path);
          } else {
            reject(new Error(`edge-tts failed with code ${pyCode}`));
          }
        });

        pyProc.on("error", (err3) => reject(err3));
      }
    });
  });
}
