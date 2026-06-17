# OmniVoice API

FastAPI wrapper cho [OmniVoice](https://github.com/k2-fsa/OmniVoice) — zero-shot multilingual TTS với 600+ ngôn ngữ, hỗ trợ voice cloning và voice design.

---

## Setup

```bash
cd Q:\omnivoice-api
python -m venv venv
.\venv\Scripts\activate
pip install -e Q:\OmniVoice
pip install -r requirements.txt
python -m src
```

Mở **http://localhost:8000/docs** để test.

---

## API

### Voice Cloning

Clone giọng nói từ file audio mẫu (3-10 giây).

```python
# Python API gốc của OmniVoice
audio = model.generate(
    text="Hello, this is a test of zero-shot voice cloning.",
    ref_audio="ref.wav",
    ref_text="Transcription of the reference audio.",
)
```

```bash
# Gọi qua HTTP API
curl -X POST http://localhost:8000/api/v1/tts \
  -F "text=Hello, this is a test of zero-shot voice cloning." \
  -F "ref_audio=ref.wav" \
  -F "ref_text=Transcription of the reference audio."
```

- `text` — nội dung cần đọc
- `ref_audio` — đường dẫn file giọng mẫu (hoặc upload file)
- `ref_text` — nội dung của file giọng mẫu (có thể bỏ qua, model tự ASR)

Có thể upload file trực tiếp thay vì dùng đường dẫn:

```bash
curl -X POST http://localhost:8000/api/v1/tts \
  -F "text=Hello, this is a test of zero-shot voice cloning." \
  -F "ref_text=Transcription of the reference audio." \
  -F "file=@ref.wav"
```

---

### Voice Design

Tả giọng nói mong muốn, không cần file mẫu.

```python
# Python API gốc của OmniVoice
audio = model.generate(
    text="Hello, this is a test of zero-shot voice design.",
    instruct="female, low pitch, british accent",
)
```

```bash
# Gọi qua HTTP API
curl -X POST http://localhost:8000/api/v1/tts \
  -F "text=Hello, this is a test of zero-shot voice design." \
  -F "instruct=female, low pitch, british accent"
```

- `text` — nội dung cần đọc
- `instruct` — mô tả giọng nói

Thuộc tính voice design: `male`/`female`, `low pitch`/`high pitch`, `British accent`/`American accent`, `whisper`, `child`/`elderly`, ...

---

### Upload file

Dùng upload nếu bạn muốn tải file giọng mẫu lên trước, rồi dùng đường dẫn cho nhiều request.

```bash
curl -F "file=@ref.wav" http://localhost:8000/api/v1/upload
```

Trả về: `{ "path": "uploads/abc.wav", "url": "..." }`

Sau đó dùng `ref_audio=uploads/abc.wav` cho voice cloning.

---

### Kiểm tra server

```
GET http://localhost:8000/health
```

---

## JavaScript

```javascript
// Voice cloning
const form = new FormData();
form.append("text", "Hello, this is a test of zero-shot voice cloning.");
form.append("file", audioFile);
form.append("ref_text", "Transcription of the reference audio.");
const res = await fetch("http://localhost:8000/api/v1/tts", { method: "POST", body: form });
const data = await res.json();
new Audio(data.audio_url).play();

// Voice design
const form2 = new FormData();
form2.append("text", "Hello, this is a test of zero-shot voice design.");
form2.append("instruct", "female, low pitch, british accent");
const res2 = await fetch("http://localhost:8000/api/v1/tts", { method: "POST", body: form2 });
```

---

## Python

```python
import requests

# Voice cloning
r = requests.post("http://localhost:8000/api/v1/tts", data={
    "text": "Hello, this is a test of zero-shot voice cloning.",
    "ref_text": "Transcription of the reference audio.",
}, files={"file": open("ref.wav", "rb")})
print(r.json()["audio_url"])

# Voice design
r = requests.post("http://localhost:8000/api/v1/tts", data={
    "text": "Hello, this is a test of zero-shot voice design.",
    "instruct": "female, low pitch, british accent",
})
```
