import fs from "fs";

/**
 * Transcribes PCM 16kHz 16-bit mono audio buffer using Groq Whisper API (whisper-large-v3-turbo)
 * Fast ~150ms transcription in native Node.js
 */
export async function transcribeWithGroq(pcmBuffer, language = "en") {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) {
    throw new Error("GROQ_API_KEY is missing in .env! Please add GROQ_API_KEY=your_key");
  }

  // Convert raw PCM to WAV container with standard 44-byte RIFF header
  const wavHeader = createWavHeader(pcmBuffer.length, 16000, 1, 16);
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  // Create multipart/form-data payload natively using Fetch Blob
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const formData = new FormData();
  formData.append("file", blob, "speech.wav");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "json");

  // Restrict Whisper vocabulary & detection strictly to English & Hindi (Hinglish)
  const defaultPrompt = "Transcribe English and Hindi speech accurately. Do not transcribe into foreign languages.";
  formData.append("prompt", defaultPrompt);

  if (language) {
    formData.append("language", language);
  }

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqApiKey}`,
    },
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Groq STT failed with status ${response.status}`);
  }

  return data.text ? data.text.trim() : "";
}

function createWavHeader(dataLength, sampleRate, numChannels, bitsPerSample) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, 28);
  header.writeUInt16LE((numChannels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}
