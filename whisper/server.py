#!/usr/bin/env python3
"""Local mlx-whisper HTTP server. Listen 127.0.0.1:8173, POST /transcribe."""

from __future__ import annotations

import json
import os
import tempfile
from email import message_from_bytes
from email.message import Message
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get('WHISPER_HOST', '127.0.0.1')
PORT = int(os.environ.get('WHISPER_PORT', '8173'))
MODEL = os.environ.get('WHISPER_MODEL', 'mlx-community/whisper-large-v3-mlx')
MAX_BYTES = int(os.environ.get('WHISPER_MAX_BYTES', str(100 * 1024 * 1024)))


def json_bytes(payload: dict[str, object]) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode('utf-8')


def parse_multipart(content_type: str, body: bytes) -> tuple[bytes | None, str, str | None]:
    wrapper = (
        b'Content-Type: '
        + content_type.encode('ascii', 'replace')
        + b'\r\nMIME-Version: 1.0\r\n\r\n'
        + body
    )

    message = message_from_bytes(wrapper)
    upload: bytes | None = None
    filename = 'audio'
    language: str | None = None

    parts: list[Message] = [message]

    if message.is_multipart():
        parts = list(message.walk())

    for part in parts:
        name = part.get_param('name', header='content-disposition')

        if name == 'file':
            payload = part.get_payload(decode=True)

            if isinstance(payload, bytes):
                upload = payload
            raw_name = part.get_filename()

            if raw_name:
                filename = raw_name
        elif name == 'language':
            payload = part.get_payload(decode=True)

            if isinstance(payload, bytes):
                text = payload.decode('utf-8', 'replace').strip()

                if text:
                    language = text

    return upload, filename, language


TERMINALS = '。！？.!?…'
PAUSE_COMMA = 0.25
PAUSE_PERIOD = 0.8


def has_cjk(text: str) -> bool:
    return any('\u4e00' <= char <= '\u9fff' for char in text)


def use_cjk(language: str | None, text: str) -> bool:
    if language:
        return language.lower().startswith('zh') or language.lower() in ('chinese', 'ja', 'japanese')
    return has_cjk(text)


def ends_with_punct(text: str) -> bool:
    return bool(text) and text[-1] in f'{TERMINALS}，,;；'


def punctuate_segments(segments: list[object], language: str | None) -> str:
    pieces: list[tuple[float, float, str]] = []

    for item in segments:
        if not isinstance(item, dict):
            continue
        text = item.get('text')
        start = item.get('start')
        end = item.get('end')
        if not isinstance(text, str):
            continue
        cleaned = text.strip()
        if not cleaned:
            continue
        pieces.append((
            float(start) if isinstance(start, (int, float)) else 0.0,
            float(end) if isinstance(end, (int, float)) else 0.0,
            cleaned,
        ))

    if not pieces:
        return ''

    joined = ''.join(text for _, _, text in pieces)
    cjk = use_cjk(language, joined)
    comma = '，' if cjk else ', '
    period = '。' if cjk else '. '

    parts: list[str] = []
    prev_end: float | None = None

    for start, end, text in pieces:
        if parts and prev_end is not None and not ends_with_punct(parts[-1]):
            gap = start - prev_end
            if gap >= PAUSE_PERIOD:
                parts[-1] += period
            elif gap >= PAUSE_COMMA:
                parts[-1] += comma
            elif not cjk:
                parts.append(' ')
        parts.append(text)
        prev_end = end

    result = ''.join(parts).strip()
    if result and result[-1] not in TERMINALS:
        result += period.strip()
    return result


def transcribe_file(path: str, language: str | None) -> str:
    try:
        import mlx_whisper  # type: ignore[import-untyped]
    except ImportError as error:
        raise RuntimeError('未安装 mlx-whisper，请先执行 make whisper') from error

    prompt = '请在语句停顿处使用逗号或句号。Please add commas and periods at pauses.'
    result = mlx_whisper.transcribe(
        path,
        path_or_hf_repo=MODEL,
        language=language,
        initial_prompt=prompt,
    )

    if not isinstance(result, dict):
        return ''

    segments = result.get('segments')
    if isinstance(segments, list) and segments:
        return punctuate_segments(segments, language)

    text = result.get('text')
    return text.strip() if isinstance(text, str) else ''


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        print(f'[whisper] {self.address_string()} {format % args}')

    def send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path.split('?', 1)[0] in ('/', '/health'):
            self.send_json(200, {'ok': True, 'model': MODEL})

            return

        self.send_json(404, {'error': 'not found'})

    def do_POST(self) -> None:
        path = self.path.split('?', 1)[0]
        if path != '/transcribe':
            self.send_json(404, {'error': 'not found'})
            return

        length = int(self.headers.get('Content-Length') or '0')
        if length <= 0:
            self.send_json(400, {'error': '缺少上传文件'})
            return

        if length > MAX_BYTES:
            self.send_json(413, {'error': '文件太大'})
            return

        content_type = self.headers.get('Content-Type', '')

        if 'multipart/form-data' not in content_type:
            self.send_json(400, {'error': '请用 multipart 字段 file 上传音频'})
            return

        body = self.rfile.read(length)
        upload, filename, language = parse_multipart(content_type, body)

        if not upload:
            self.send_json(400, {'error': '请用 multipart 字段 file 上传音频'})
            return

        suffix = Path(filename).suffix or '.bin'
        tmp_path = ''

        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp_path = tmp.name
                tmp.write(upload)

            text = transcribe_file(tmp_path, language)
            self.send_json(200, {'text': text})
        except (OSError, ValueError, RuntimeError) as error:
            self.send_json(500, {'error': str(error) or '转写失败'})
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f'[whisper] {HOST}:{PORT} model={MODEL}')
    server.serve_forever()

if __name__ == '__main__':
    main()
