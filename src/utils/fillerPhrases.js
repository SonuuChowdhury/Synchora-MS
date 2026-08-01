/**
 * Context-aware bilingual (English & Hindi) filler phrases for instant voice acknowledgement
 */

export const fillersEnglish = {
  research: [
    "Let me look that up.",
    "Searching for that.",
    "One moment, checking.",
    "Give me a second."
  ],
  finance: [
    "Got it.",
    "Noted.",
    "Sure, logging that.",
    "Okay, recording that."
  ],
  schedule: [
    "Let me check your schedule.",
    "Sure, one moment.",
    "Checking your calendar."
  ],
  chat: [
    "Hmm.",
    "Yes.",
    "Okay, thinking.",
    "Let me think about that.",
    "Right."
  ],
  default: [
    "One moment.",
    "Sure.",
    "Okay.",
    "Let me check.",
    "Alright."
  ]
};

export const fillersHindi = {
  research: [
    "एक मिनट, देख रहे हैं।",
    "चेक कर रहे हैं।",
    "थोड़ा समय दीजिए।"
  ],
  finance: [
    "जी, नोट कर लिया।",
    "ठीक है, लिख लिया।"
  ],
  schedule: [
    "आपका शेड्यूल देख रहे हैं।",
    "एक सेकंड, चेक कर रहे हैं।"
  ],
  chat: [
    "जी हाँ।",
    "सोच रहे हैं, एक मिनट।"
  ],
  default: [
    "एक मिनट रुकीए।",
    "जी, देख रहे हैं।"
  ]
};

export function getRandomFiller(intent = "default", text = "") {
  if (intent === "none" || !intent) return null;
  const isHindi = /[\u0900-\u097F]/.test(text) || /(kya|kaun|kab|kahan|kyun|kaise|batao|dhundho|paisa|kharcha)/i.test(text);
  const poolSource = isHindi ? fillersHindi : fillersEnglish;
  const pool = poolSource[intent] ?? poolSource.default;
  return pool[Math.floor(Math.random() * pool.length)];
}
