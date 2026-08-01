import sys
import subprocess

# DEPRECATED — Legacy Python TTS script replaced by Microsoft Edge Neural TTS.
text = sys.stdin.read().strip()
if text:
    subprocess.run(["edge-tts", "--voice", "en-US-AvaNeural", "--text", text])
