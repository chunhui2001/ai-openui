export type Role = 'user' | 'assistant'

export type Message = {
  role: Role
  content: string
}

export type OllamaModel = {
  name: string
}

export type TagsResponse = {
  models: OllamaModel[]
}

export type ChatChunk = {
  message?: {
    role?: string
    content?: string
  }
  error?: string
  done?: boolean
}
