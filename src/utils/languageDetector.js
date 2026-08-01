/**
 * Helper to auto-select optimal Edge-TTS voice based on text language (English vs Hindi Devanagari/Hinglish).
 */

export function selectVoiceForText(text = "") {
  // Devanagari Unicode range: \u0900-\u097F
  const containsDevanagari = /[\u0900-\u097F]/.test(text);

  if (containsDevanagari) {
    return process.env.TTS_HINDI_VOICE || "hi-IN-SwaraNeural";
  }

  return process.env.TTS_VOICE || "en-IN-NeerjaNeural";
}
