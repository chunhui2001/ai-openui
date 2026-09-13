import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { ShikiTransformer } from '@shikijs/types'
import bash from '@shikijs/langs/bash'
import css from '@shikijs/langs/css'
import go from '@shikijs/langs/go'
import html from '@shikijs/langs/html'
import javascript from '@shikijs/langs/javascript'
import json from '@shikijs/langs/json'
import python from '@shikijs/langs/python'
import sql from '@shikijs/langs/sql'
import typescript from '@shikijs/langs/typescript'
import xml from '@shikijs/langs/xml'
import yaml from '@shikijs/langs/yaml'
import githubDark from '@shikijs/themes/github-dark'
import type { Message, MessageAudio, TokenUsage } from './types'

const SHIKI_LANGS = [
  'bash',
  'css',
  'go',
  'html',
  'javascript',
  'json',
  'python',
  'sql',
  'typescript',
  'xml',
  'yaml',
] as const

const LANG_SET = new Set<string>(SHIKI_LANGS)

const LANG_ALIAS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
}

type ContentPart = { type: 'text'; value: string } | { type: 'code'; lang: string; value: string }

let highlighter: HighlighterCore | null = null

void createHighlighterCore({
  themes: [githubDark],
  langs: [bash, css, go, html, javascript, json, python, sql, typescript, xml, yaml],
  engine: createJavaScriptRegexEngine(),
}).then((ready) => {
  highlighter = ready
  refreshHighlightedContent()
})

function transformerRenderLineNumber(): ShikiTransformer {
  return {
    name: 'line-numbers',
    line(node, line) {
      node.children.unshift({
        type: 'element',
        tagName: 'span',
        properties: {
          class: 'line-number',
          'aria-hidden': 'true',
        },
        children: [{ type: 'text', value: String(line) }],
      })
    },
  }
}

function langFor(name: string): string {
  const key = (LANG_ALIAS[name.toLowerCase()] ?? name.toLowerCase()).trim()
  return LANG_SET.has(key) ? key : 'plaintext'
}

function renderPlainCode(lang: string, value: string): HTMLElement {
  const pre = document.createElement('pre')
  pre.className = 'shiki'
  const code = document.createElement('code')
  code.className = `language-${lang}`
  const lines = value.split('\n')
  for (const [index, line] of lines.entries()) {
    const row = document.createElement('span')
    row.className = 'line'
    const number = document.createElement('span')
    number.className = 'line-number'
    number.setAttribute('aria-hidden', 'true')
    number.textContent = String(index + 1)
    row.append(number, document.createTextNode(line || ' '))
    code.append(row)
  }
  pre.append(code)
  return pre
}

function renderCodeBlock(lang: string, value: string): HTMLElement {
  if (!highlighter) {
    return renderPlainCode(lang, value)
  }

  const wrap = document.createElement('div')
  wrap.innerHTML = highlighter.codeToHtml(value, {
    lang,
    theme: 'github-dark',
    transformers: [transformerRenderLineNumber()],
  })
  const pre = wrap.firstElementChild
  return pre instanceof HTMLElement ? pre : renderPlainCode(lang, value)
}

function refreshHighlightedContent(): void {
  const root = document.getElementById('messages')
  if (!root) {
    return
  }
  for (const el of root.querySelectorAll<HTMLElement>('.content[data-source]')) {
    fillContent(el, el.dataset.source ?? '')
  }
}

function splitContent(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  let index = 0

  while (index < text.length) {
    const open = text.indexOf('```', index)
    if (open === -1) {
      parts.push({ type: 'text', value: text.slice(index) })
      break
    }

    if (open > index) {
      parts.push({ type: 'text', value: text.slice(index, open) })
    }

    const after = open + 3
    const newline = text.indexOf('\n', after)
    const info = (newline === -1 ? text.slice(after) : text.slice(after, newline)).trim()
    const lang = info.split(/\s+/, 1)[0] ?? ''
    const bodyStart = newline === -1 ? text.length : newline + 1
    const close = text.indexOf('```', bodyStart)

    if (close === -1) {
      parts.push({ type: 'code', lang, value: text.slice(bodyStart) })
      break
    }

    parts.push({ type: 'code', lang, value: text.slice(bodyStart, close).replace(/\n$/, '') })
    index = close + 3
    if (text[index] === '\n') {
      index += 1
    }
  }

  return parts
}

function fillContent(el: HTMLElement, text: string): void {
  el.replaceChildren()
  if (!text) {
    delete el.dataset.source
    el.textContent = '…'
    return
  }

  el.dataset.source = text

  for (const part of splitContent(text)) {
    if (part.type === 'text') {
      if (part.value) {
        el.append(document.createTextNode(part.value))
      }
      continue
    }

    el.append(renderCodeBlock(langFor(part.lang), part.value))
  }
}

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`缺少元素 #${id}`)
  }
  return el as T
}

export const els = {
  model: $<HTMLSelectElement>('model'),
  modelPicker: $('model-picker'),
  modelSkeleton: $('model-skeleton'),
  modelTrigger: $<HTMLButtonElement>('model-trigger'),
  modelMenu: $<HTMLUListElement>('model-menu'),
  clear: $<HTMLButtonElement>('clear'),
  status: $('status'),
  messages: $('messages'),
  streamPulse: $('stream-pulse'),
  input: $<HTMLTextAreaElement>('input'),
  send: $<HTMLButtonElement>('send'),
  stop: $<HTMLButtonElement>('stop'),
  audio: $<HTMLInputElement>('audio'),
  transcribe: $<HTMLButtonElement>('transcribe'),
  record: $<HTMLButtonElement>('record'),
  recordClip: $('record-clip'),
  recordClipFill: $('record-clip-fill'),
  recordClipTime: $('record-clip-time'),
  usage: $('usage'),
}

export function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const MAX_RECORD_MS = 60_000

const CLIP_MIN_PX = 96
const CLIP_MAX_PX = 280
const CLIP_MIN_MS = 2_000

export function clipFillPercent(durationMs: number): string {
  return `${Math.min(100, Math.max(4, (durationMs / MAX_RECORD_MS) * 100))}%`
}

export function clipWidthPx(durationMs: number): string {
  const t = Math.min(1, Math.max(0, (durationMs - CLIP_MIN_MS) / (MAX_RECORD_MS - CLIP_MIN_MS)))
  return `${Math.round(CLIP_MIN_PX + t * (CLIP_MAX_PX - CLIP_MIN_PX))}px`
}

export function setPendingClip(durationMs: number | null): void {
  if (durationMs === null) {
    els.recordClip.hidden = true
    els.recordClipTime.textContent = '0:00'
    els.recordClipFill.style.width = '4%'
    return
  }

  els.recordClip.hidden = false
  els.recordClipTime.textContent = formatDuration(durationMs)
  els.recordClipFill.style.width = clipFillPercent(durationMs)
}

export function setUsage(last: TokenUsage | null, session: TokenUsage): void {
  if (!last && session.prompt === 0 && session.completion === 0) {
    els.usage.hidden = true
    els.usage.textContent = ''
    return
  }

  const lastText = last
    ? `本轮 入 ${last.prompt} · 出 ${last.completion} · 共 ${last.prompt + last.completion}`
    : '本轮 —'
  const sessionText = `会话 入 ${session.prompt} · 出 ${session.completion} · 共 ${session.prompt + session.completion}`

  els.usage.hidden = false
  els.usage.textContent = `${lastText}　${sessionText}`
}

export function setStatus(text: string, kind: 'info' | 'error' = 'info'): void {
  if (!text) {
    els.status.hidden = true
    els.status.textContent = ''
    els.status.classList.remove('error')

    return
  }

  els.status.hidden = false
  els.status.textContent = text
  els.status.classList.toggle('error', kind === 'error')
}

export function setModelPickerReady(): void {
  els.modelSkeleton.hidden = true
  els.modelTrigger.hidden = false
  els.modelPicker.removeAttribute('aria-busy')
}

export function fillModels(models: string[], preferred = 'qwen2.5vl:32b'): void {
  els.model.replaceChildren()
  els.modelMenu.replaceChildren()

  const selected = models.includes(preferred) ? preferred : (models[0] ?? '')

  for (const name of models) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    els.model.append(option)

    const item = document.createElement('li')
    item.role = 'option'
    item.dataset.value = name
    item.textContent = name
    els.modelMenu.append(item)
  }

  setModelValue(selected)
}

export function setGenerating(generating: boolean): void {
  els.send.hidden = generating
  els.stop.hidden = !generating
  els.input.disabled = generating
  els.model.disabled = generating
  els.modelTrigger.disabled = generating
  els.clear.disabled = generating
  els.transcribe.disabled = generating
  els.record.disabled = generating
  els.streamPulse.hidden = !generating

  if (generating) {
    setModelMenuOpen(false)
  }
}

export function setTranscribing(busy: boolean): void {
  els.transcribe.disabled = busy
  els.send.disabled = busy
  els.audio.disabled = busy
  els.record.disabled = busy
}

export function setRecording(recording: boolean): void {
  els.record.classList.toggle('is-recording', recording)
  els.recordClip.classList.toggle('is-live', recording)
  els.record.setAttribute('aria-pressed', String(recording))
  els.record.setAttribute('aria-label', recording ? '松开结束录音' : '按住录音')
  els.record.title = recording ? '松开结束录音' : '按住录音'
  els.send.disabled = recording
  els.transcribe.disabled = recording
  els.audio.disabled = recording
}

function setModelValue(name: string): void {
  els.model.value = name
  els.modelTrigger.textContent = name || '选择模型'

  for (const item of els.modelMenu.querySelectorAll('[role="option"]')) {
    const active = item instanceof HTMLElement && item.dataset.value === name
    item.classList.toggle('is-active', active)
    item.setAttribute('aria-selected', String(active))
  }
}

function setModelMenuOpen(open: boolean): void {
  els.modelMenu.hidden = !open
  els.modelTrigger.setAttribute('aria-expanded', String(open))
}

function isModelMenuOpen(): boolean {
  return !els.modelMenu.hidden
}

function bindModelPicker(): void {
  els.modelTrigger.addEventListener('click', () => {
    if (els.modelTrigger.disabled) {
      return
    }

    setModelMenuOpen(!isModelMenuOpen())
  })

  els.modelMenu.addEventListener('click', (event) => {
    const item = event.target instanceof HTMLElement ? event.target.closest('[role="option"]') : null

    if (!(item instanceof HTMLElement) || !item.dataset.value) {
      return
    }

    setModelValue(item.dataset.value)
    setModelMenuOpen(false)
  })

  document.addEventListener('click', (event) => {
    if (!els.modelPicker.contains(event.target as Node)) {
      setModelMenuOpen(false)
    }
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setModelMenuOpen(false)
    }
  })
}

bindModelPicker()

export function renderMessages(messages: Message[]): void {
  els.messages.replaceChildren()

  if (messages.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = '还没有对话。选择模型后发送一条消息即可。'
    els.messages.append(empty)

    return
  }

  for (const [index, message] of messages.entries()) {
    els.messages.append(createBubble(message, index))
  }
}

export function scrollToBottom(): void {
  els.messages.scrollTop = els.messages.scrollHeight
}

export function updateLastAssistant(content: string): void {
  const last = els.messages.querySelector<HTMLElement>('.msg.assistant:last-of-type .content')

  if (last) {
    fillContent(last, content)
  }
}

function createBubble(message: Message, index: number): HTMLElement {
  const article = document.createElement('article')
  article.className = `msg ${message.role}`

  const role = document.createElement('div')
  role.className = 'role'
  role.textContent = message.role === 'user' ? '你' : '助手'
  article.append(role)

  if (message.audio) {
    if (message.content) {
      const caption = document.createElement('div')
      caption.className = 'content'
      fillContent(caption, message.content)
      article.append(caption)
    }

    article.append(createAudioClip(message.audio))

    if (message.transcribing) {
      const pending = document.createElement('div')
      pending.className = 'content is-pending'
      pending.textContent = '正在转写…'
      article.append(pending)
    } else if (message.transcript) {
      const transcript = document.createElement('div')
      transcript.className = 'content'
      transcript.textContent = message.transcript
      article.append(transcript)
    } else {
      article.append(createTranscribeButton(index))
    }

    return article
  }

  const content = document.createElement('div')
  content.className = 'content'

  if (message.role === 'assistant' && !message.content) {
    content.append(createLoadingDots())
    article.append(content)
  } else if (message.content) {
    fillContent(content, message.content)
    article.append(content)

    if (message.role === 'assistant') {
      article.append(createSpeakButton(index))
    }
  }

  return article
}

function createSpeakButton(index: number): HTMLElement {
  const button = document.createElement('button')

  button.type = 'button'
  button.className = 'audio-speak'
  button.dataset.speak = String(index)
  button.setAttribute('aria-label', '朗读回复')
  button.title = '朗读回复'
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 10v4h4l5 4V6L7 10H3Zm13.5 2a3.5 3.5 0 0 0-2-3.15v6.3A3.5 3.5 0 0 0 16.5 12ZM14 5.23v1.7a6 6 0 0 1 0 10.14v1.7a7.7 7.7 0 0 0 0-13.54Z"/></svg>'

  return button
}

function createTranscribeButton(index: number): HTMLElement {
  const button = document.createElement('button')

  button.type = 'button'
  button.className = 'audio-transcribe'
  button.dataset.transcribe = String(index)
  button.setAttribute('aria-label', '转写语音')
  button.title = '转写语音'
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 6h14v2H5V6Zm0 5h14v2H5v-2Zm0 5h10v2H5v-2Z"/></svg>'

  return button
}

function createAudioClip(audio: MessageAudio): HTMLElement {
  const clip = document.createElement('button')
  clip.type = 'button'
  clip.className = 'audio-clip'
  clip.style.width = clipWidthPx(audio.durationMs)
  clip.setAttribute('aria-label', `播放录音 ${formatDuration(audio.durationMs)}`)

  const fill = document.createElement('span')
  fill.className = 'audio-clip-fill'
  fill.style.width = '100%'

  const time = document.createElement('span')
  time.className = 'audio-clip-time'
  time.textContent = formatDuration(audio.durationMs)

  const player = document.createElement('audio')
  player.src = audio.url
  player.preload = 'metadata'

  clip.addEventListener('click', () => {
    if (player.paused) {
      void player.play()
    } else {
      player.pause()
    }
  })

  player.addEventListener('play', () => {
    clip.classList.add('is-playing')
  })
  player.addEventListener('pause', () => {
    clip.classList.remove('is-playing')
  })
  player.addEventListener('ended', () => {
    clip.classList.remove('is-playing')
  })

  clip.append(fill, time, player)

  return clip
}

function createLoadingDots(): HTMLElement {
  const dots = document.createElement('span')
  dots.className = 'loading-dots'
  dots.setAttribute('aria-label', '生成中')

  for (let i = 0; i < 3; i += 1) {
    dots.append(document.createElement('i'))
  }

  return dots
}
