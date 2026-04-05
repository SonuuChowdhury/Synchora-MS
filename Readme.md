# Synchora — AI Automation Agent

> Voice-controlled AI assistant designed to connect with a wearable device, with full backend automation, NLP intent detection, finance tracking, scheduling, web research, and Telegram integration.

🌐 [Website](https://synchora-seven.vercel.app/) · 📁 [GitHub](https://github.com/SonuuChowdhury/Synchora-MS) · 👤 [Developer Portfolio](https://portfolio-sonuuchowdhury.vercel.app) · 📓 [Build Logbook](https://docs.google.com/document/d/18II7gRaO29cJ0GnAKNLhQsrgbbmvOMZdw-WH79EImz4/edit?usp=drive_web)

---

## What is Synchora?

Synchora is an end-to-end AI automation agent built to connect with a wearable device (hardware integration in progress). Hold the button, speak a command, and the device streams raw PCM audio to a Node.js server over WebSocket. The server runs STT (Speech-to-Text), detects your intent with Gemini, routes to the appropriate agent chain or LangGraph agent, and returns a spoken response via TTS.

> **Try it locally** — there's no hosted backend. Clone the repo, set up your `.env`, and run the server to explore the full pipeline.

---

## Architecture Overview

```
ESP32 Device (INMP441 mic + button)
        │
        │  WebSocket (ws://) — binary PCM + JSON control frames
        ▼
Node.js / Express Server (port 5000)
        │
        ├─ STT  ──► Python (SpeechRecognition)
        │
        ├─ Intent Detection ──► Gemini Flash (LangChain)
        │
        ├─ Task Router
        │     ├─ chat           → Gemini conversation chain
        │     ├─ finance.add    → MongoDB finance model
        │     ├─ finance.query  → Aggregation + Gemini
        │     ├─ schedule.add   → MongoDB schedule model
        │     ├─ schedule.query → Retrieval + Gemini
        │     └─ research       → LangGraph autonomous agent
        │                          (Gemini + SerpAPI web scraping)
        │
        ├─ TTS  ──► Python (ElevenLabs API)
        │
        └─ Telegram Bot ──► Notifications / Replies
```

---

## Features

- **Voice-controlled** — PTT button on ESP32 streams 16kHz 16-bit mono PCM over WebSocket
- **Intent detection** — Gemini Flash classifies every utterance into typed intents
- **Finance tracking** — Add and query personal finance records stored in MongoDB
- **Schedule management** — Add events and query upcoming schedules via natural language
- **Autonomous research agent** — LangGraph graph with Gemini 2.5 Flash + SerpAPI for multi-step web research
- **Conversational chat** — General-purpose AI chat with Redis-backed session memory
- **Telegram notifications** — Bot integration for asynchronous updates and alerts
- **TTS response** — ElevenLabs voice synthesis streamed back to the device

---

## Tech Stack

| Layer | Technology |
|---|---|
| Device | ESP32 + INMP441 I2S microphone (hardware integration in progress) |
| Transport | WebSocket (`ws` library) |
| Backend | Node.js, Express 5, MongoDB (Mongoose), Redis |
| AI / LLM | Google Gemini 2.5 Flash via `@langchain/google-genai` |
| Agent Framework | LangChain JS + LangGraph JS |
| STT | Python `SpeechRecognition` |
| TTS | Python `elevenlabs` SDK |
| Search | SerpAPI (`google-search-results-nodejs`) |
| Notifications | Telegram Bot (`node-telegram-bot-api`) |

---

## Project Structure

```
synchora-ms/
├── src/
│   ├── assistant.tasks/
│   │   ├── task.graph/          # LangGraph autonomous research agent
│   │   ├── tasks.chain/         # LangChain chains (chat, finance, schedule, intent)
│   │   └── app.handler.js       # Task router
│   ├── bot/                     # Telegram bot
│   ├── config/                  # Gemini, Redis, scraper configs
│   ├── db/                      # Mongoose connection
│   ├── db.tasks/                # DB read/write helpers
│   ├── model/                   # Mongoose schemas
│   ├── prompts/                 # All LLM prompt templates
│   ├── routes/                  # Express routes
│   ├── stt/stt.py               # Speech-to-text (Python)
│   └── tts/TTS.py               # Text-to-speech (Python)
├── listen.js                    # WebSocket server + audio pipeline
├── index.js                     # Express app entry point
└── requirements.txt             # Python dependencies
```

---

## Setup

### Prerequisites

- Node.js ≥ 20
- Python ≥ 3.10
- MongoDB Atlas cluster
- Redis instance (e.g. Redis Cloud)
- Google Gemini API key(s)
- ElevenLabs API key
- SerpAPI key
- Telegram bot token

### 1. Clone and install

```bash
git clone https://github.com/SonuuChowdhury/Synchora-MS.git
cd Synchora-MS
npm install
pip install -r requirements.txt
```

### 2. Configure environment

Create a `.env` file:

```env
GEMINI_INTENT_KEY=your_gemini_key_for_intent_detection
GEMINI_APP_KEY=your_gemini_key_for_main_app
EL_API_KEY=your_elevenlabs_key
MONGODB_URI=your_mongodb_connection_string
REDIS_URL=your_redis_url
SERP_API_KEY=your_serpapi_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id
JWT_SECRET=your_jwt_secret
DEVICE_ID=your_device_token
```

### 3. Run the server

```bash
node index.js
```

Server starts on `http://localhost:5000`. WebSocket accepts connections on the same port.

### 4. Tunnel for device access (development)

```bash
ngrok http 5000
# Use ws:// (not wss://) URL in ESP32 firmware
```

---

## ESP32 Device Protocol

The device communicates via WebSocket with a mix of JSON control frames and binary PCM audio:

```
→ { "event": "TOKEN", "user_id": "<DEVICE_ID>" }   # Auth on connect
→ { "event": "START" }                              # Button pressed
→ <binary PCM chunks at 16kHz 16-bit mono>          # Audio while held
→ { "event": "END" }                                # Button released
← "Synchora response text" or TTS audio             # Server reply
```

---

## Intents

| Intent | Description |
|---|---|
| `chat` | General conversation |
| `finance.add` | Log income/expense |
| `finance.query` | Query financial records |
| `schedule.add` | Add calendar event |
| `schedule.query` | Query upcoming events |
| `research` | Autonomous web research via LangGraph |

---

## Build Logbook

The full development process — debugging sessions, design decisions, hardware issues, and architecture evolution — is documented in the [Project Progress + Log Book](https://docs.google.com/document/d/18II7gRaO29cJ0GnAKNLhQsrgbbmvOMZdw-WH79EImz4/edit?usp=drive_web).

---

## Developer

**Sonu Chowdhury**
- Portfolio: [portfolio-sonuuchowdhury.vercel.app](https://portfolio-sonuuchowdhury.vercel.app)
- GitHub: [@SonuuChowdhury](https://github.com/SonuuChowdhury)
- Email: chowdhurysonu047@gmail.com

---

## License

ISC