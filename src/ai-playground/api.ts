import type { ChatChunk, Message, TagsResponse, TokenUsage } from './types'

export function usageFromChunk(chunk: ChatChunk): TokenUsage | null {
  const prompt = chunk.prompt_eval_count
  const completion = chunk.eval_count

  if (typeof prompt !== 'number' && typeof completion !== 'number') {
    return null
  }

  return {
    prompt: prompt ?? 0,
    completion: completion ?? 0,
  }
}

const OLLAMA = '/ollama'

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string }

    return data.error || `${res.status} ${res.statusText}`
  } catch {
    return `${res.status} ${res.statusText}`
  }
}

export async function transcribe(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file, file.name)

  const res = await fetch('/whisper/transcribe', {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    throw new Error(`转写失败：${await readError(res)}`)
  }

  const data = (await res.json()) as { text?: string; error?: string }

  if (data.error) {
    throw new Error(data.error)
  }

  return (data.text ?? '').trim()
}

export const SPEAK_MAX_CHARS = 500

function lastSentenceEnd(text: string): number {
  return Math.max(
    text.lastIndexOf('。'),
    text.lastIndexOf('！'),
    text.lastIndexOf('？'),
    text.lastIndexOf('.'),
    text.lastIndexOf('!'),
    text.lastIndexOf('?'),
    text.lastIndexOf('\n'),
  )
}

export function splitSpeakText(text: string, limit = SPEAK_MAX_CHARS): string[] {
  let rest = text.trim()
  if (!rest) {
    return []
  }

  const chunks: string[] = []

  while (rest.length > limit) {
    const cut = rest.slice(0, limit)
    const last = lastSentenceEnd(cut)
    const end = last >= limit / 2 ? last + 1 : limit
    chunks.push(rest.slice(0, end).trim())
    rest = rest.slice(end).trim()
  }

  if (rest) {
    chunks.push(rest)
  }

  return chunks
}

export async function speak(text: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch('/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  })

  if (!res.ok) {
    throw new Error(`朗读失败：${await readError(res)}`)
  }

  return res.blob()
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
): Promise<TokenUsage | null> {
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
  let usage: TokenUsage | null = null

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
        return usageFromChunk(chunk)
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

    if (chunk.done) {
      usage = usageFromChunk(chunk)
    }
  }

  return usage
}
