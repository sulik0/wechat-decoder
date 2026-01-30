import { ChatSession, ChatMessage, ParsedData } from '../types'

// Generate unique ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15)
}

// Parse timestamp to number
const parseTimestamp = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const num = parseInt(value, 10)
    if (!isNaN(num)) return num
    const date = new Date(value)
    if (!isNaN(date.getTime())) return date.getTime()
  }
  return Date.now()
}

// Parse JSON format chat data
export const parseJsonData = (jsonData: unknown): ParsedData => {
  const startTime = performance.now()
  const sessions: ChatSession[] = []
  
  try {
    if (Array.isArray(jsonData)) {
      // Array of sessions or messages
      if (jsonData.length > 0 && 'messages' in jsonData[0]) {
        // Array of sessions
        for (const sessionData of jsonData) {
          const session = parseSessionObject(sessionData)
          if (session) sessions.push(session)
        }
      } else {
        // Flat array of messages - group by sender
        const groupedMessages = groupMessagesByConversation(jsonData)
        sessions.push(...groupedMessages)
      }
    } else if (typeof jsonData === 'object' && jsonData !== null) {
      // Single session or keyed sessions
      const data = jsonData as Record<string, unknown>
      if ('messages' in data || 'chatList' in data) {
        const session = parseSessionObject(data)
        if (session) sessions.push(session)
      } else {
        // Keyed sessions object
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value)) {
            const session: ChatSession = {
              id: generateId(),
              name: key,
              messageCount: value.length,
              messages: value.map(parseMessageObject).filter(Boolean) as ChatMessage[],
              isGroup: false,
            }
            if (session.messages.length > 0) {
              session.lastMessage = session.messages[session.messages.length - 1].content
              session.lastMessageTime = session.messages[session.messages.length - 1].timestamp
            }
            sessions.push(session)
          }
        }
      }
    }
  } catch (error) {
    console.error('Error parsing JSON data:', error)
  }
  
  const endTime = performance.now()
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0)
  
  return {
    sessions,
    totalMessages,
    parseTime: endTime - startTime,
  }
}

// Parse a single session object
const parseSessionObject = (data: Record<string, unknown>): ChatSession | null => {
  const messages = (data.messages || data.chatList || data.chat || []) as unknown[]
  if (!Array.isArray(messages)) return null
  
  const parsedMessages = messages.map(parseMessageObject).filter(Boolean) as ChatMessage[]
  
  return {
    id: String(data.id || data.sessionId || generateId()),
    name: String(data.name || data.nickname || data.title || '未知会话'),
    avatar: data.avatar as string | undefined,
    messageCount: parsedMessages.length,
    messages: parsedMessages,
    lastMessage: parsedMessages[parsedMessages.length - 1]?.content,
    lastMessageTime: parsedMessages[parsedMessages.length - 1]?.timestamp,
    isGroup: Boolean(data.isGroup || data.is_group || data.chatType === 'group'),
  }
}

// Parse message type code to string
const parseMessageType = (typeCode: unknown): ChatMessage['type'] => {
  const code = typeof typeCode === 'number' ? typeCode : parseInt(String(typeCode), 10)
  
  // 微信消息类型码
  const typeMap: Record<number, ChatMessage['type']> = {
    1: 'text',
    3: 'image',
    34: 'voice',
    42: 'text',      // 名片
    43: 'video',
    47: 'text',      // 表情
    48: 'text',      // 位置
    49: 'file',      // 文件/链接/小程序等
    50: 'voice',     // 语音通话
    10000: 'system', // 系统消息
    10002: 'system', // 撤回消息
  }
  
  return typeMap[code] || 'text'
}

// Parse a single message object
const parseMessageObject = (data: unknown): ChatMessage | null => {
  if (typeof data !== 'object' || data === null) return null
  
  const msg = data as Record<string, unknown>
  
  // 支持多种字段名格式 (WeChatMsg/PyWxDump/自定义格式)
  const content = String(
    msg.StrContent ||      // WeChatMsg 格式
    msg.strContent ||
    msg.content || 
    msg.message || 
    msg.text || 
    msg.msg ||
    msg.Content ||
    ''
  )
  
  if (!content) return null
  
  // Determine message type - 支持数字类型码
  const typeValue = msg.Type || msg.type || msg.msgType || msg.message_type
  let type: ChatMessage['type'] = 'text'
  
  if (typeof typeValue === 'number' || (typeof typeValue === 'string' && /^\d+$/.test(typeValue))) {
    type = parseMessageType(typeValue)
  } else if (typeof typeValue === 'string') {
    if (typeValue.includes('image')) type = 'image'
    else if (typeValue.includes('voice') || typeValue.includes('audio')) type = 'voice'
    else if (typeValue.includes('video')) type = 'video'
    else if (typeValue.includes('file')) type = 'file'
    else if (typeValue.includes('system')) type = 'system'
  }
  
  // Determine if self-sent - 支持多种字段名
  const isSendValue = msg.IsSend ?? msg.isSend ?? msg.is_send ?? msg.issend
  const isSelf = Boolean(
    msg.isSelf || 
    msg.is_self || 
    isSendValue === 1 ||
    isSendValue === '1' ||
    isSendValue === true ||
    msg.direction === 'send' ||
    msg.type_name === '发送'
  )
  
  // 解析时间戳 - 支持秒和毫秒
  let timestamp = msg.CreateTime || msg.createTime || msg.create_time || 
                  msg.timestamp || msg.time || msg.Timestamp || msg.Time
  
  if (typeof timestamp === 'number') {
    // 如果是秒级时间戳（小于 10000000000），转换为毫秒
    if (timestamp < 10000000000) {
      timestamp = timestamp * 1000
    }
  }
  
  return {
    id: String(msg.localId || msg.MsgSvrID || msg.msgSvrId || msg.id || msg.msgId || msg.message_id || generateId()),
    senderId: String(msg.StrTalker || msg.strTalker || msg.talker || msg.senderId || msg.sender_id || msg.wxid || ''),
    senderName: String(msg.NickName || msg.nickName || msg.nickname || msg.senderName || msg.sender_name || msg.remark || (isSelf ? '我' : '对方')),
    content,
    timestamp: parseTimestamp(timestamp),
    type,
    isSelf,
  }
}

// Group flat messages by conversation (StrTalker/会话ID)
const groupMessagesByConversation = (messages: unknown[]): ChatSession[] => {
  const sessionMap = new Map<string, { messages: ChatMessage[], name: string }>()
  
  for (const msg of messages) {
    const parsed = parseMessageObject(msg)
    if (!parsed) continue
    
    // 使用 senderId (StrTalker) 作为会话分组键
    const key = parsed.senderId || 'unknown'
    
    if (!sessionMap.has(key)) {
      // 获取会话名称 - 优先使用非自己发送消息的发送者名称
      const displayName = !parsed.isSelf && parsed.senderName !== '对方' 
        ? parsed.senderName 
        : key
      sessionMap.set(key, { messages: [], name: displayName })
    }
    
    // 更新会话名称（如果找到更好的名称）
    if (!parsed.isSelf && parsed.senderName !== '对方' && parsed.senderName !== key) {
      const session = sessionMap.get(key)!
      if (session.name === key || session.name === 'unknown') {
        session.name = parsed.senderName
      }
    }
    
    sessionMap.get(key)!.messages.push(parsed)
  }
  
  // 转换为会话列表
  const sessions = Array.from(sessionMap.entries()).map(([key, data]) => {
    const msgs = data.messages.sort((a, b) => a.timestamp - b.timestamp)
    return {
      id: generateId(),
      name: data.name,
      messageCount: msgs.length,
      messages: msgs,
      lastMessage: msgs[msgs.length - 1]?.content,
      lastMessageTime: msgs[msgs.length - 1]?.timestamp,
      isGroup: key.includes('@chatroom'),
    }
  })
  
  // 按最后消息时间排序
  sessions.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))
  
  return sessions
}

// Parse CSV format
export const parseCsvData = (csvContent: string): ParsedData => {
  const startTime = performance.now()
  const lines = csvContent.split('\n').filter(line => line.trim())
  
  if (lines.length < 2) {
    return { sessions: [], totalMessages: 0, parseTime: 0 }
  }
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const messages: ChatMessage[] = []
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    if (values.length !== headers.length) continue
    
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx]
    })
    
    // 支持 WeChatMsg/PyWxDump 导出的 CSV 格式
    const content = row.strcontent || row.content || row.message || row.text || row.msg || ''
    if (!content) continue
    
    // 解析 IsSend 字段
    const isSendValue = row.issend || row.is_send || row.isself || row.is_self || row.direction || ''
    const isSelf = ['1', 'true', 'yes', '发送'].includes(isSendValue.toLowerCase())
    
    // 解析时间戳 - WeChatMsg 使用秒级时间戳
    let timestamp = parseInt(row.createtime || row.timestamp || row.time || '0', 10)
    if (timestamp > 0 && timestamp < 10000000000) {
      timestamp = timestamp * 1000 // 转换为毫秒
    }
    
    // 解析消息类型
    const typeCode = parseInt(row.type || row.msgtype || '1', 10)
    const type = parseMessageTypeFromCode(typeCode)
    
    messages.push({
      id: row.localid || row.msgsrvid || row.id || generateId(),
      senderId: row.strtalker || row.talker || row.senderid || row.sender_id || row.wxid || '',
      senderName: row.nickname || row.sendername || row.sender_name || row.remark || (isSelf ? '我' : '对方'),
      content,
      timestamp: timestamp || Date.now(),
      type,
      isSelf,
    })
  }
  
  messages.sort((a, b) => a.timestamp - b.timestamp)
  
  // 按 talker 分组会话
  const sessionMap = new Map<string, ChatMessage[]>()
  for (const msg of messages) {
    const key = msg.senderId || '未知会话'
    if (!sessionMap.has(key)) {
      sessionMap.set(key, [])
    }
    sessionMap.get(key)!.push(msg)
  }
  
  // 如果只有一个会话，直接返回
  if (sessionMap.size <= 1) {
    const session: ChatSession = {
      id: generateId(),
      name: '导入的聊天记录',
      messageCount: messages.length,
      messages,
      lastMessage: messages[messages.length - 1]?.content,
      lastMessageTime: messages[messages.length - 1]?.timestamp,
      isGroup: false,
    }
    
    return {
      sessions: messages.length > 0 ? [session] : [],
      totalMessages: messages.length,
      parseTime: performance.now() - startTime,
    }
  }
  
  // 多会话
  const sessions: ChatSession[] = Array.from(sessionMap.entries()).map(([talker, msgs]) => ({
    id: generateId(),
    name: msgs[0]?.senderName !== '我' ? msgs[0]?.senderName : talker,
    messageCount: msgs.length,
    messages: msgs.sort((a, b) => a.timestamp - b.timestamp),
    lastMessage: msgs[msgs.length - 1]?.content,
    lastMessageTime: msgs[msgs.length - 1]?.timestamp,
    isGroup: talker.includes('@chatroom'),
  }))
  
  sessions.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))
  
  return {
    sessions,
    totalMessages: messages.length,
    parseTime: performance.now() - startTime,
  }
}

// 从类型码解析消息类型
const parseMessageTypeFromCode = (code: number): ChatMessage['type'] => {
  const typeMap: Record<number, ChatMessage['type']> = {
    1: 'text',
    3: 'image',
    34: 'voice',
    43: 'video',
    49: 'file',
    10000: 'system',
    10002: 'system',
  }
  return typeMap[code] || 'text'
}

// Parse CSV line handling quoted values
const parseCsvLine = (line: string): string[] => {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  result.push(current.trim())
  return result
}

// Parse plain text format (simple conversation)
export const parseTextData = (textContent: string): ParsedData => {
  const startTime = performance.now()
  const lines = textContent.split('\n').filter(line => line.trim())
  const messages: ChatMessage[] = []
  
  // Common patterns for chat logs
  const patterns = [
    // Pattern: [timestamp] sender: message
    /^\[(.+?)\]\s*(.+?)[:：]\s*(.+)$/,
    // Pattern: timestamp sender: message
    /^(\d{4}[-/]\d{2}[-/]\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\s+(.+?)[:：]\s*(.+)$/,
    // Pattern: sender: message
    /^(.+?)[:：]\s*(.+)$/,
  ]
  
  for (const line of lines) {
    let matched = false
    
    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match) {
        let timestamp: number
        let sender: string
        let content: string
        
        if (match.length === 4) {
          // Has timestamp
          timestamp = parseTimestamp(match[1])
          sender = match[2].trim()
          content = match[3].trim()
        } else {
          // No timestamp
          timestamp = Date.now()
          sender = match[1].trim()
          content = match[2].trim()
        }
        
        const isSelf = ['我', 'me', 'self', '本人'].includes(sender.toLowerCase())
        
        messages.push({
          id: generateId(),
          senderId: sender,
          senderName: sender,
          content,
          timestamp,
          type: 'text',
          isSelf,
        })
        
        matched = true
        break
      }
    }
    
    // If no pattern matched, treat as continuation of previous message
    if (!matched && messages.length > 0) {
      messages[messages.length - 1].content += '\n' + line.trim()
    }
  }
  
  const session: ChatSession = {
    id: generateId(),
    name: '导入的聊天记录',
    messageCount: messages.length,
    messages,
    lastMessage: messages[messages.length - 1]?.content,
    lastMessageTime: messages[messages.length - 1]?.timestamp,
    isGroup: false,
  }
  
  const endTime = performance.now()
  
  return {
    sessions: messages.length > 0 ? [session] : [],
    totalMessages: messages.length,
    parseTime: endTime - startTime,
  }
}

// Main parser that detects format
export const parseFile = async (file: File): Promise<ParsedData> => {
  const text = await file.text()
  const fileName = file.name.toLowerCase()
  
  if (fileName.endsWith('.json')) {
    try {
      const jsonData = JSON.parse(text)
      return parseJsonData(jsonData)
    } catch {
      console.error('Invalid JSON file')
      return { sessions: [], totalMessages: 0, parseTime: 0 }
    }
  }
  
  if (fileName.endsWith('.csv')) {
    return parseCsvData(text)
  }
  
  // Try to auto-detect format
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const jsonData = JSON.parse(text)
      return parseJsonData(jsonData)
    } catch {
      // Not valid JSON, try other formats
    }
  }
  
  if (trimmed.includes(',') && trimmed.split('\n')[0].split(',').length > 2) {
    return parseCsvData(text)
  }
  
  return parseTextData(text)
}
