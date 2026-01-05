import sys
import os
from elevenlabs import ElevenLabs
from dotenv import load_dotenv

load_dotenv()

EL_API_KEY = os.getenv("EL_API_KEY")

client = ElevenLabs(api_key=EL_API_KEY)

text = sys.stdin.read().strip()
if not text:
    sys.exit(1)

audio_stream = client.text_to_speech.convert(
    voice_id="tnSpp4vdxKPjI9w0GnoV",
    model_id="eleven_multilingual_v2",
    text=text,
    output_format="pcm_16000"
)

# Stream PCM bytes to stdout
for chunk in audio_stream:
    if chunk:
        sys.stdout.buffer.write(chunk)
        sys.stdout.buffer.flush()
