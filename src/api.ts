import type { ChatChunk, Message, TagsResponse } from './types'

const OLLAMA = '/ollama'

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }

    return data.error || `${res.status} ${res.statusText}`
  } catch {
    return `${res.status} ${res.statusText}`
  }
}

export async function listModels(): Promise<string[]> {
  const res = await fetch(`${OLLAMA}/api/tags`)

  if (!res.ok) {
    throw new Error(`无法读取模型列表：${await readError(res)}`)
  }

  const data = (await res.json()) as TagsResponse

  return (data.models ?? []).map((model) => model.name)
}

export async function chatOnce(model: string, messages: Message[]): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  })

  if (!res.ok) {
    throw new Error(`对话失败：${await readError(res)}`)
  }

  const data = (await res.json()) as ChatChunk

  if (data.error) {
    throw new Error(data.error)
  }

  return data.message?.content ?? ''
}

export async function chatStream(
  model: string,
  messages: Message[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })

  if (!res.ok) {
    throw new Error(`对话失败：${await readError(res)}`)
  }

  if (!res.body) {
    throw new Error('响应没有可读流')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed) {
        continue
      }

      const chunk = JSON.parse(trimmed) as ChatChunk

      if (chunk.error) {
        throw new Error(chunk.error)
      }

      if (chunk.message?.content) {
        onToken(chunk.message.content)
      }

      if (chunk.done) {
        return
      }
    }
  }

  const leftover = buffer.trim()

  if (leftover) {
    const chunk = JSON.parse(leftover) as ChatChunk

    if (chunk.error) {
      throw new Error(chunk.error)
    }

    if (chunk.message?.content) {
      onToken(chunk.message.content)
    }
  }
}
