import sys
import json
import speech_recognition as sr

SAMPLE_RATE = 16000
SAMPLE_WIDTH = 2
MIN_SEC = 0.3

def main():
    pcm = sys.stdin.buffer.read()

    if not pcm:
        print(json.dumps({"success": False, "error": "empty audio"}), flush=True)
        return

    duration = len(pcm) / (SAMPLE_RATE * SAMPLE_WIDTH)
    if duration < MIN_SEC:
        print(json.dumps({"success": False, "error": "audio too short"}), flush=True)
        return

    r = sr.Recognizer()
    audio = sr.AudioData(pcm, SAMPLE_RATE, SAMPLE_WIDTH)

    try:
        text = r.recognize_google(audio)
        print(json.dumps({"success": True, "text": text.strip()}), flush=True)
    except sr.UnknownValueError:
        print(json.dumps({"success": False, "error": "not understood"}), flush=True)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
