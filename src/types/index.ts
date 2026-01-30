export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: number
  type: 'text' | 'image' | 'voice' | 'video' | 'file' | 'system'
  isSelf: boolean
}

export interface ChatSession {
  id: string
  name: string
  avatar?: string
  lastMessage?: string
  lastMessageTime?: number
  messageCount: number
  messages: ChatMessage[]
  isGroup: boolean
}

export interface ParsedData {
  sessions: ChatSession[]
  totalMessages: number
  parseTime: number
}
