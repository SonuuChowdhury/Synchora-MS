/**
 * Zero-latency keyword scanner to guess rough intent from STT text.
 * Includes English, Hindi (Devanagari), and Hinglish keywords.
 * Returns "none" for greetings and simple pleasantries to skip thinking fillers.
 */

const greetingKeywords = [
  "hi", "hello", "hey", "how are you", "good morning", "good afternoon",
  "good evening", "who are you", "what is your name", "thank you", "thanks", "bye",
  "नमस्ते", "कैसे हो", "कैसे हैं", "धन्यवाद", "शुक्रिया",
  "namaste", "kaise ho", "kaise hain", "dhanyawad", "shukriya"
];

const keywordMap = {
  research: [
    "what is", "who is", "when did", "where is", "why is", "explain", "tell me about", "tell me", "which", "search", "find", "news",
    "क्या है", "कौन है", "कब हुआ", "कहां है", "क्यों है", "बताओ", "ढूंढो",
    "kya hai", "kaun hai", "kab hua", "kahan hai", "kyun hai", "batao", "dhundho"
  ],
  finance: [
    "spent", "expense", "rupees", "paid", "bought", "add expense", "cost", "money", "rupee", "price", "budget",
    "खर्चा", "रुपये", "खरीदा", "दिया", "पैसा",
    "kharcha", "rupaye", "kharida", "diya", "paisa"
  ],
  schedule: [
    "remind", "schedule", "appointment", "meeting", "calendar", "alarm", "tomorrow", "task", "todo",
    "याद", "कल", "समय", "मीटिंग",
    "yaad", "kal", "samay", "meeting"
  ]
};

function matchesExactKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\s|[^a-zA-Z0-9_\\u0900-\\u097F])${escaped}(?:$|\\s|[^a-zA-Z0-9_\\u0900-\\u097F])`, "i");
  return regex.test(text);
}

export function guessIntentFromKeywords(text = "") {
  const lower = text.trim().toLowerCase();

  // If text matches greetings/pleasantries -> skip thinking filler completely
  if (greetingKeywords.some((g) => matchesExactKeyword(lower, g))) {
    return "none";
  }

  // Short words (<= 2 words) without specific task action -> skip thinking filler
  const wordCount = lower.split(/\s+/).length;
  if (wordCount <= 2 && !keywordMap.finance.some(k => matchesExactKeyword(lower, k)) && !keywordMap.schedule.some(k => matchesExactKeyword(lower, k))) {
    return "none";
  }

  for (const [intent, keywords] of Object.entries(keywordMap)) {
    if (keywords.some((kw) => matchesExactKeyword(lower, kw))) {
      return intent;
    }
  }

  // General questions > 4 words get default filler ("One moment")
  return wordCount > 4 ? "default" : "none";
}
