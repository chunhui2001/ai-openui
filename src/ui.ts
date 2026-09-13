import type { Message } from './types'

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) {
    throw new Error(`缺少元素 #${id}`)
  }
  return el as T
}

export const els = {
  model: $<HTMLSelectElement>('model'),
  clear: $<HTMLButtonElement>('clear'),
  status: $('status'),
  messages: $('messages'),
  input: $<HTMLTextAreaElement>('input'),
  send: $<HTMLButtonElement>('send'),
  stop: $<HTMLButtonElement>('stop'),
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

export function fillModels(models: string[], preferred = 'llama3.2:3b'): void {
  els.model.replaceChildren()

  for (const name of models) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    els.model.append(option)
  }

  els.model.value = models.includes(preferred) ? preferred : (models[0] ?? '')
}

export function setGenerating(generating: boolean): void {
  els.send.hidden = generating
  els.stop.hidden = !generating
  els.input.disabled = generating
  els.model.disabled = generating
  els.clear.disabled = generating
}

export function renderMessages(messages: Message[]): void {
  els.messages.replaceChildren()
  if (messages.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = '还没有对话。选择模型后发送一条消息即可。'
    els.messages.append(empty)
    return
  }

  for (const message of messages) {
    els.messages.append(createBubble(message))
  }
  scrollToBottom()
}

export function updateLastAssistant(content: string): void {
  const last = els.messages.querySelector<HTMLElement>('.msg.assistant:last-of-type .content')
  if (last) {
    last.textContent = content || '…'
    scrollToBottom()
  }
}

function createBubble(message: Message): HTMLElement {
  const article = document.createElement('article')
  article.className = `msg ${message.role}`

  const role = document.createElement('div')
  role.className = 'role'
  role.textContent = message.role === 'user' ? '你' : '助手'

  const content = document.createElement('div')
  content.className = 'content'
  content.textContent = message.content || (message.role === 'assistant' ? '…' : '')

  article.append(role, content)
  return article
}

function scrollToBottom(): void {
  els.messages.scrollTop = els.messages.scrollHeight
}
