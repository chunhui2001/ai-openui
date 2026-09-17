export type Role = 'user' | 'assistant'

export type MessageAudio = {
  url: string
  durationMs: number
  file: File
}

export type MessageImage = {
  file: File
  url: string
  base64: string
}

export type Message = {
  role: Role
  content: string
  images?: MessageImage[]
  audio?: MessageAudio
  transcript?: string
  transcribing?: boolean
}

export type OllamaMessage = {
  role: Role
  content: string
  images?: string[]
}

export type OllamaModel = {
  name: string
}

export type TagsResponse = {
  models: OllamaModel[]
}

export type TokenUsage = {
  prompt: number
  completion: number
}

export type ChatChunk = {
  message?: {
    role?: string
    content?: string
  }
  error?: string
  done?: boolean
  prompt_eval_count?: number
  eval_count?: number
}
