export type Role = 'user' | 'assistant'

export type MessageAudio = {
  url: string
  durationMs: number
  file: File
}

export type Message = {
  role: Role
  content: string
  audio?: MessageAudio
  transcript?: string
  transcribing?: boolean
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
