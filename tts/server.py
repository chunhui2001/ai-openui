#!/usr/bin/env python3
"""Local mlx-audio TTS. Listen 127.0.0.1:8273, POST /speak."""

from __future__ import annotations

import io
import json
import os
import threading
import time
import traceback
from collections.abc import Iterable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get('TTS_HOST', '127.0.0.1')
PORT = int(os.environ.get('TTS_PORT', '8273'))
MODEL = os.environ.get('TTS_MODEL', 'mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit')
DEFAULT_VOICE = os.environ.get('TTS_VOICE', 'Serena')
DEFAULT_INSTRUCT = os.environ.get('TTS_INSTRUCT', '')
MAX_CHARS = int(os.environ.get('TTS_MAX_CHARS', '500'))
SENTENCE_END = '。！？.!?\n'
MAX_TOKENS_CAP = int(os.environ.get('TTS_MAX_TOKENS', '2048'))
WARMUP_TEXT = os.environ.get('TTS_WARMUP_TEXT', '你好。')

_model: object | None = None
_lock = threading.Lock()


def json_bytes(payload: dict[str, object]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode('utf-8')


def client_closed(error: BaseException) -> bool:
    if isinstance(error, (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)):
        return True
    return isinstance(error, OSError) and error.errno in {32, 54, 104}


def lang_for_voice(voice: str) -> str:
    code = voice[:1].lower() if voice else 'z'
    if code in {'a', 'b', 'e', 'f', 'h', 'i', 'j', 'p', 'z'}:
        return code
    return 'z'


def is_qwen3() -> bool:
    name = MODEL.lower()
    return 'qwen3-tts' in name or 'qwen3_tts' in name


def max_tokens_for(text: str) -> int:
    return min(MAX_TOKENS_CAP, max(256, len(text) * 8 + 64))


def clip_text(text: str, limit: int = MAX_CHARS) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    ends = [cut.rfind(mark) for mark in SENTENCE_END]
    last = max(ends)
    if last >= limit // 2:
        return cut[: last + 1].strip()
    return cut.strip()


def audio_to_float32(audio: object) -> object:
    import numpy as np

    array = np.array(audio)
    if array.size == 0:
        raise RuntimeError('空音频')
    return np.asarray(array, dtype=np.float32).reshape(-1)


def load_tts() -> object:
    global _model
    if _model is not None:
        return _model

    try:
        from mlx_audio.tts.utils import load_model  # type: ignore[import-untyped]
    except ImportError as error:
        raise RuntimeError('未安装 mlx-audio，请先执行 make tts') from error

    loaded = load_model(MODEL)
    if loaded is None:
        raise RuntimeError('无法加载 TTS 模型')
    _model = loaded
    return loaded


def iter_results(
    model: object,
    text: str,
    voice: str,
    speed: float,
    instruct: str,
    max_tokens: int,
) -> Iterable[object]:
    custom = getattr(model, 'generate_custom_voice', None)
    if is_qwen3() and callable(custom):
        results = custom(
            text=text,
            speaker=voice,
            language='Chinese',
            instruct=instruct or None,
            max_tokens=max_tokens,
        )
        return results if isinstance(results, Iterable) else (results,)

    generate = getattr(model, 'generate', None)
    if not callable(generate):
        raise RuntimeError('TTS 模型没有 generate 方法')

    results = generate(
        text=text,
        voice=voice,
        speed=speed,
        lang_code=lang_for_voice(voice),
    )
    return results if isinstance(results, Iterable) else (results,)


def synthesize(text: str, voice: str, speed: float, instruct: str) -> bytes:
    import numpy as np
    import soundfile as sf

    model = load_tts()
    chunks: list[object] = []
    sample_rate = 24000
    max_tokens = max_tokens_for(text)
    started = time.perf_counter()
    print(f'[tts] speak chars={len(text)} max_tokens={max_tokens}')

    with _lock:
        for result in iter_results(model, text, voice, speed, instruct, max_tokens):
            audio = getattr(result, 'audio', None)
            if audio is None:
                continue
            rate = getattr(result, 'sample_rate', None)
            if isinstance(rate, (int, float)) and rate > 0:
                sample_rate = int(rate)
            chunks.append(audio_to_float32(audio))

    if not chunks:
        raise RuntimeError('没有生成音频')

    waveform = np.concatenate(chunks)
    peak = float(np.max(np.abs(waveform))) if waveform.size else 0.0
    if peak > 1e-6:
        waveform = waveform * (0.9 / peak)
    np.clip(waveform, -1.0, 1.0, out=waveform)
    duration = waveform.size / sample_rate if sample_rate else 0.0
    print(f'[tts] wave sr={sample_rate} dur={duration:.2f}s peak={peak:.3f}')

    buffer = io.BytesIO()
    sf.write(buffer, waveform, sample_rate, format='WAV', subtype='PCM_16')
    wav = buffer.getvalue()
    print(f'[tts] speak done {time.perf_counter() - started:.1f}s bytes={len(wav)}')
    return wav


def warmup() -> None:
    print(f'[tts] warmup {WARMUP_TEXT!r}')
    started = time.perf_counter()
    try:
        synthesize(WARMUP_TEXT, DEFAULT_VOICE, 1.0, DEFAULT_INSTRUCT)
        print(f'[tts] warmup done {time.perf_counter() - started:.1f}s')
    except (OSError, ValueError, RuntimeError) as error:
        print(f'[tts] warmup failed: {error}')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        print(f'[tts] {self.address_string()} {format % args}')

    def send_body(self, status: int, content_type: str, body: bytes) -> None:
        try:
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError as error:
            if client_closed(error):
                print('[tts] client closed')
                return
            raise

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        self.send_body(status, 'application/json; charset=utf-8', json_bytes(payload))

    def do_GET(self) -> None:
        if self.path.split('?', 1)[0] in ('/', '/health'):
            self.send_json(200, {'ok': True, 'model': MODEL, 'voice': DEFAULT_VOICE})
            return

        self.send_json(404, {'error': 'not found'})

    def do_POST(self) -> None:
        path = self.path.split('?', 1)[0]
        if path != '/speak':
            self.send_json(404, {'error': 'not found'})
            return

        length = int(self.headers.get('Content-Length') or '0')
        if length <= 0:
            self.send_json(400, {'error': '缺少 JSON 正文'})
            return

        if length > 200_000:
            self.send_json(413, {'error': '文本太大'})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {'error': 'JSON 无法解析'})
            return

        if not isinstance(payload, dict):
            self.send_json(400, {'error': 'JSON 无法解析'})
            return

        text = payload.get('text')
        if not isinstance(text, str) or not text.strip():
            self.send_json(400, {'error': '缺少 text'})
            return

        text = clip_text(text.strip())

        voice = payload.get('voice')
        if not isinstance(voice, str) or not voice.strip():
            voice = DEFAULT_VOICE

        speed = payload.get('speed', 1.0)
        if not isinstance(speed, (int, float)) or speed <= 0:
            speed = 1.0

        instruct = payload.get('instruct')
        if not isinstance(instruct, str) or not instruct.strip():
            instruct = DEFAULT_INSTRUCT

        try:
            wav = synthesize(text, voice.strip(), float(speed), instruct.strip())
        except Exception as error:
            traceback.print_exc()
            self.send_json(500, {'error': str(error) or '合成失败'})
            return

        self.send_body(200, 'audio/wav', wav)


def main() -> None:
    print(f'[tts] loading {MODEL}')
    load_tts()
    warmup()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'[tts] {HOST}:{PORT} model={MODEL} voice={DEFAULT_VOICE}')
    server.serve_forever()


if __name__ == '__main__':
    main()
