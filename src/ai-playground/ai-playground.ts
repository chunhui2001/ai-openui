import { chatStream, listModels, speak, splitSpeakText, transcribe } from './api'
import type { Message, TokenUsage } from './types'
import {
  els,
  fillModels,
  renderMessages,
  setModelPickerReady,
  setGenerating,
  setStatus,
  setUsage,
  setTranscribing,
  setRecording,
  setPendingClip,
  scrollToBottom,
  updateLastAssistant,
  MAX_RECORD_MS,
} from './ui'

import '../base.css'
import './ai-playground.css'

let messages: Message[] = []
let abort: AbortController | null = null
let generating = false
let sessionUsage: TokenUsage = { prompt: 0, completion: 0 }
let recorder: MediaRecorder | null = null
let recordChunks: Blob[] = []
let recordStream: MediaStream | null = null
let holdingRecord = false
let recordStartedAt = 0
let recordTimer: ReturnType<typeof setInterval> | null = null
let pendingRecord: { file: File; url: string; durationMs: number } | null = null

async function loadModels(): Promise<void> {
  try {
    const models = await listModels()

    if (models.length === 0) {
      setStatus('Ollama 已连接，但还没有拉取模型。', 'error')

      return
    }

    fillModels(models)
    setStatus('')
  } catch (error) {
    setStatus(toErrorMessage(error, '无法连接 Ollama，请确认服务已在 11434 启动。'), 'error')
  } finally {
    setModelPickerReady()
  }
}

function clearPendingRecord(): void {
  if (pendingRecord) {
    URL.revokeObjectURL(pendingRecord.url)
    pendingRecord = null
  }

  setPendingClip(null)
}

function keepPendingRecord(file: File, durationMs: number): void {
  if (pendingRecord) {
    URL.revokeObjectURL(pendingRecord.url)
  }

  pendingRecord = {
    file,
    url: URL.createObjectURL(file),
    durationMs,
  }

  setPendingClip(durationMs)
}

function restorePendingClip(): void {
  if (pendingRecord) {
    setPendingClip(pendingRecord.durationMs)

    return
  }

  setPendingClip(null)
}

async function sendRecording(): Promise<void> {
  if (!pendingRecord || generating) {
    return
  }

  const pending = pendingRecord
  pendingRecord = null
  setPendingClip(null)

  const caption = els.input.value.trim()
  els.input.value = ''

  messages.push({
    role: 'user',
    content: caption,
    audio: {
      url: pending.url,
      durationMs: pending.durationMs,
      file: pending.file,
    },
  })

  renderMessages(messages)
  scrollToBottom()
  setStatus('')
  els.input.focus()
}

async function transcribeMessage(index: number): Promise<void> {
  const message = messages[index]
  if (!message?.audio || message.transcribing || message.transcript || generating) {
    return
  }

  message.transcribing = true
  renderMessages(messages)
  setTranscribing(true)

  try {
    const text = await transcribe(message.audio.file)
    message.transcribing = false
    message.transcript = text

    if (!text) {
      setStatus('转写结果为空。', 'error')
    }

    renderMessages(messages)
  } catch (error) {
    message.transcribing = false
    renderMessages(messages)
    setStatus(toErrorMessage(error, '转写失败，请确认已执行 make whisper。'), 'error')
  } finally {
    setTranscribing(false)
  }
}

async function send(): Promise<void> {
  if (generating) {
    return
  }

  if (pendingRecord) {
    await sendRecording()
    return
  }

  const text = els.input.value.trim()

  if (!text) {
    return
  }

  const model = els.model.value

  if (!model) {
    setStatus('请先选择一个模型。', 'error')
    return
  }

  els.input.value = ''
  messages.push({ role: 'user', content: text })
  messages.push({ role: 'assistant', content: '' })
  renderMessages(messages)
  scrollToBottom()
  setStatus('')

  abort = new AbortController()
  generating = true
  setGenerating(true)

  try {
    const usage = await chatStream(
      model,
      messages.slice(0, -1),
      (token) => {
        const last = messages[messages.length - 1]
        if (last) {
          last.content += token
          updateLastAssistant(last.content)
        }
      },
      abort.signal,
    )

    if (usage) {
      sessionUsage = {
        prompt: sessionUsage.prompt + usage.prompt,
        completion: sessionUsage.completion + usage.completion,
      }

      setUsage(usage, sessionUsage)
    }
  } catch (error) {
    if (isAbortError(error)) {
      const last = messages[messages.length - 1]

      if (last && !last.content) {
        last.content = '（已停止）'
      }
    } else {
      const last = messages[messages.length - 1]

      if (last) {
        last.content = last.content
          ? `${last.content}\n\n[错误] ${toErrorMessage(error)}`
          : `[错误] ${toErrorMessage(error)}`
      }

      setStatus(toErrorMessage(error), 'error')
    }

    renderMessages(messages)
  } finally {
    generating = false
    abort = null

    setGenerating(false)
    renderMessages(messages)

    els.input.focus()
  }
}

let speakAudio: HTMLAudioElement | null = null
let speakUrls: string[] = []
let speakAbort: AbortController | null = null

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function stopSpeak(): void {
  speakAbort?.abort()
  speakAbort = null

  if (speakAudio) {
    speakAudio.pause()
    speakAudio = null
  }

  for (const url of speakUrls) {
    URL.revokeObjectURL(url)
  }

  speakUrls = []
}

function playBlob(blob: Blob, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'))

      return
    }

    const url = URL.createObjectURL(blob)
    speakUrls.push(url)
    const audio = new Audio(url)
    speakAudio = audio

    const onAbort = (): void => {
      audio.pause()
      reject(new DOMException('aborted', 'AbortError'))
    }

    signal.addEventListener('abort', onAbort, { once: true })

    audio.addEventListener('ended', () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    })

    audio.addEventListener('error', () => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error('播放失败'))
    })

    void audio.play().catch((error: unknown) => {
      signal.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
}

async function speakMessage(index: number): Promise<void> {
  const message = messages[index]
  const text = message?.content.trim()

  if (!text || generating) {
    return
  }

  const chunks = splitSpeakText(text)

  if (chunks.length === 0) {
    return
  }

  const button = els.messages.querySelector<HTMLButtonElement>(`[data-speak="${index}"]`)

  if (button) {
    button.classList.add('is-busy')
    button.disabled = true
  }

  stopSpeak()
  const ac = new AbortController()
  speakAbort = ac

  try {
    let pending: Promise<Blob> | null = speak(chunks[0], ac.signal)

    for (let i = 0; i < chunks.length; i += 1) {
      setStatus(
        chunks.length > 1 ? `正在朗读 ${i + 1}/${chunks.length}` : '正在合成语音…',
      )

      if (!pending) {
        break
      }

      const blob = await pending

      if (ac.signal.aborted) {
        return
      }

      pending = i + 1 < chunks.length ? speak(chunks[i + 1], ac.signal) : null
      await playBlob(blob, ac.signal)
    }

    stopSpeak()
    setStatus('')
  } catch (error) {
    if (isAbortError(error) || ac.signal.aborted) {
      return
    }

    stopSpeak()
    setStatus(toErrorMessage(error, '朗读失败，请确认已执行 make tts。'), 'error')
  } finally {
    if (button) {
      button.classList.remove('is-busy')
      button.disabled = false
    }
  }
}

async function transcribeFile(file: File): Promise<void> {
  if (generating) {
    return
  }

  setTranscribing(true)
  setStatus('正在转写…')

  try {
    const text = await transcribe(file)

    if (!text) {
      setStatus('转写结果为空。', 'error')
      return
    }

    els.input.value = els.input.value.trim()
      ? `${els.input.value.trim()}\n${text}`
      : text

    setStatus('')
    els.input.focus()
  } catch (error) {
    setStatus(toErrorMessage(error, '转写失败，请确认已执行 make whisper。'), 'error')
  } finally {
    els.audio.value = ''
    setTranscribing(false)
  }
}

function pickRecorderMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

function stopTracks(): void {
  recordStream?.getTracks().forEach((track) => {
    track.stop()
  })

  recordStream = null
}

function clearRecordTimer(): void {
  if (recordTimer !== null) {
    clearInterval(recordTimer)
    recordTimer = null
  }
}

function tickRecord(): void {
  const remaining = Math.max(0, MAX_RECORD_MS - (Date.now() - recordStartedAt))
  setPendingClip(remaining)

  if (remaining <= 0) {
    stopRecord()
  }
}

function stopRecord(): void {
  holdingRecord = false
  clearRecordTimer()

  if (recorder && recorder.state === 'recording') {
    recorder.stop()
  }
}

async function startRecord(): Promise<void> {
  if (generating || recorder) {
    return
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    holdingRecord = false
    setStatus('当前浏览器不支持录音。', 'error')
    return
  }

  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true })

    if (!holdingRecord) {
      stopTracks()
      return
    }

    const mime = pickRecorderMime()
    recordChunks = []
    recorder = mime
      ? new MediaRecorder(recordStream, { mimeType: mime })
      : new MediaRecorder(recordStream)

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        recordChunks.push(event.data)
      }
    })

    recorder.addEventListener('stop', () => {
      const type = recorder?.mimeType || 'audio/webm'
      const chunks = recordChunks
      recorder = null
      recordChunks = []
      stopTracks()
      clearRecordTimer()
      setRecording(false)

      const elapsed = Math.min(MAX_RECORD_MS, Date.now() - recordStartedAt)
      recordStartedAt = 0

      const blob = new Blob(chunks, { type })

      if (blob.size === 0) {
        restorePendingClip()
        setStatus('没有录到声音。', 'error')
        return
      }

      if (elapsed < 2000) {
        restorePendingClip()
        setStatus('录音太短，已忽略')
        return
      }

      const ext = type.includes('mp4') ? 'm4a' : 'webm'
      keepPendingRecord(new File([blob], `recording.${ext}`, { type }), elapsed)
      setStatus('')
    })

    recorder.start()
    recordStartedAt = Date.now()
    setPendingClip(MAX_RECORD_MS)
    recordTimer = setInterval(tickRecord, 200)
    setRecording(true)
    setStatus('')

    if (!holdingRecord) {
      recorder.stop()
    }
  } catch {
    holdingRecord = false
    clearRecordTimer()
    stopTracks()
    recorder = null
    setRecording(false)
    restorePendingClip()
    setStatus('无法使用麦克风，请检查权限。', 'error')
  }
}

function stop(): void {
  abort?.abort()
}

function clearChat(): void {
  if (generating) {
    return
  }

  for (const message of messages) {
    if (message.audio) {
      URL.revokeObjectURL(message.audio.url)
    }
  }

  messages = []
  sessionUsage = { prompt: 0, completion: 0 }
  clearPendingRecord()
  stopSpeak()
  setStatus('')
  setUsage(null, sessionUsage)
  renderMessages(messages)

  els.input.focus()
}

function toErrorMessage(error: unknown, fallback = '请求失败'): string {
  return error instanceof Error && error.message ? error.message : fallback
}

els.send.addEventListener('click', () => {
  void send()
})

els.stop.addEventListener('click', stop)
els.clear.addEventListener('click', clearChat)
els.transcribe.addEventListener('click', () => {
  els.audio.click()
})

els.audio.addEventListener('change', () => {
  const file = els.audio.files?.[0]

  if (file) {
    void transcribeFile(file)
  }
})

els.record.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || generating) {
    return
  }

  event.preventDefault()
  holdingRecord = true
  els.record.setPointerCapture(event.pointerId)
  void startRecord()
})

els.record.addEventListener('pointerup', () => {
  stopRecord()
})

els.record.addEventListener('pointercancel', () => {
  stopRecord()
})

els.record.addEventListener('contextmenu', (event) => {
  event.preventDefault()
})

els.messages.addEventListener('click', (event) => {
  const origin = event.target instanceof Element ? event.target : null
  const transcribeBtn = origin?.closest('[data-transcribe]')

  if (transcribeBtn instanceof HTMLElement && transcribeBtn.dataset.transcribe !== undefined) {
    void transcribeMessage(Number(transcribeBtn.dataset.transcribe))
    return
  }

  const speakBtn = origin?.closest('[data-speak]')

  if (speakBtn instanceof HTMLElement && speakBtn.dataset.speak !== undefined) {
    void speakMessage(Number(speakBtn.dataset.speak))
  }
})

els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void send()
  }
})

renderMessages(messages)
void loadModels()

els.input.focus()
