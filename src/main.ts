import { chatStream, listModels } from './api'
import type { Message } from './types'
import {
  els,
  fillModels,
  renderMessages,
  setGenerating,
  setStatus,
  updateLastAssistant,
} from './ui'

import './styles.css'

let messages: Message[] = []
let abort: AbortController | null = null
let generating = false

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
  }
}

async function send(): Promise<void> {
  const text = els.input.value.trim()

  if (!text || generating) {
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
  setStatus('')

  abort = new AbortController()
  generating = true
  setGenerating(true)

  try {
    await chatStream(
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
    els.input.focus()
  }
}

function stop(): void {
  abort?.abort()
}

function clearChat(): void {
  if (generating) {
    return
  }
  messages = []
  setStatus('')
  renderMessages(messages)
  els.input.focus()
}

function toErrorMessage(error: unknown, fallback = '请求失败'): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

els.send.addEventListener('click', () => {
  void send()
})

els.stop.addEventListener('click', stop)
els.clear.addEventListener('click', clearChat)
els.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void send()
  }
})

renderMessages(messages)
void loadModels()

els.input.focus()
