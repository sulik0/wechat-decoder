/**
 * SQLite database parser for WeChat chat records
 * Supports decrypted .db files using sql.js
 */

import initSqlJs, { Database, SqlValue } from 'sql.js';
import { ChatSession, ChatMessage, ParsedData } from '../types';

// Generate unique ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 15);
};

// Message type mapping
const getMessageType = (typeCode: number): ChatMessage['type'] => {
  const typeMap: Record<number, ChatMessage['type']> = {
    1: 'text',
    3: 'image',
    34: 'voice',
    43: 'video',
    47: 'text', // emoji
    49: 'file',
    10000: 'system',
    10002: 'system'
  };
  return typeMap[typeCode] || 'text';
};

// Initialize sql.js
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

const getSql = async () => {
  if (!SQL) {
    SQL = await initSqlJs({
      // Load sql-wasm.wasm from CDN
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`
    });
  }
  return SQL;
};

/**
 * Parse a decrypted WeChat database file
 */
export const parseDbFile = async (buffer: ArrayBuffer): Promise<ParsedData> => {
  const startTime = performance.now();
  const sessions: ChatSession[] = [];

  try {
    const SqlJs = await getSql();
    const db = new SqlJs.Database(new Uint8Array(buffer));

    // Get contacts first
    const contacts = extractContacts(db);

    // Extract messages
    const messages = extractMessages(db, contacts);

    // Group messages by talker (chat session)
    const sessionMap = new Map<string, ChatMessage[]>();

    for (const msg of messages) {
      const talker = msg.senderId || 'unknown';
      if (!sessionMap.has(talker)) {
        sessionMap.set(talker, []);
      }
      sessionMap.get(talker)!.push(msg);
    }

    // Convert to ChatSession array
    for (const [talkerId, msgs] of sessionMap) {
      msgs.sort((a, b) => a.timestamp - b.timestamp);

      const session: ChatSession = {
        id: generateId(),
        name: contacts.get(talkerId) || talkerId,
        messageCount: msgs.length,
        messages: msgs,
        lastMessage: msgs[msgs.length - 1]?.content?.substring(0, 50),
        lastMessageTime: msgs[msgs.length - 1]?.timestamp,
        isGroup: talkerId.includes('@chatroom')
      };

      sessions.push(session);
    }

    // Sort sessions by last message time
    sessions.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));

    db.close();
  } catch (error) {
    console.error('Error parsing database:', error);
    throw new Error(`数据库解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }

  const endTime = performance.now();
  const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);

  return {
    sessions,
    totalMessages,
    parseTime: endTime - startTime
  };
};

/**
 * Extract contacts from database
 */
const extractContacts = (db: Database): Map<string, string> => {
  const contacts = new Map<string, string>();

  // Try different table structures
  const tableQueries = [
    "SELECT userName, nickName FROM WCContact",
    "SELECT username, nickname FROM Contact",
    "SELECT UserName, NickName FROM Friend",
    "SELECT username, alias FROM rcontact WHERE alias != ''"
  ];

  for (const query of tableQueries) {
    try {
      const result = db.exec(query);
      if (result.length > 0) {
        for (const row of result[0].values) {
          const [username, nickname] = row as [string, string];
          if (username && nickname) {
            contacts.set(username, nickname);
          }
        }
        break;
      }
    } catch {
      // Table doesn't exist, try next
    }
  }

  return contacts;
};

/**
 * Extract messages from database
 */
const extractMessages = (db: Database, contacts: Map<string, string>): ChatMessage[] => {
  const messages: ChatMessage[] = [];

  // Try to find message tables
  let tables: string[] = [];
  try {
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    if (result.length > 0) {
      tables = result[0].values.map((row: SqlValue[]) => row[0] as string);
    }
  } catch {
    return messages;
  }

  // Find message tables (MSG, Chat_xxx, message, etc.)
  const msgTables = tables.filter(t => 
    t.toUpperCase().includes('MSG') || 
    t.toUpperCase().startsWith('CHAT_') ||
    t.toLowerCase() === 'message'
  );

  for (const table of msgTables) {
    try {
      // Get table columns
      const columnsResult = db.exec(`PRAGMA table_info(${table})`);
      if (columnsResult.length === 0) continue;

      const columns: string[] = columnsResult[0].values.map((row: SqlValue[]) => (row[1] as string).toLowerCase());

      // Map column names
      const contentCol = columns.find((c: string) => ['strcontent', 'content', 'message', 'msg'].includes(c));
      const timeCol = columns.find((c: string) => ['createtime', 'time', 'timestamp', 'msgcreatetime'].includes(c));
      const talkerCol = columns.find((c: string) => ['strtalker', 'talker', 'sender', 'chatusr', 'username'].includes(c));
      const typeCol = columns.find((c: string) => ['type', 'msgtype', 'msg_type'].includes(c));
      const isSendCol = columns.find((c: string) => ['issend', 'is_send', 'issender'].includes(c));

      if (!contentCol) continue;

      // Build query
      const selectCols = [contentCol];
      if (timeCol) selectCols.push(timeCol);
      if (talkerCol) selectCols.push(talkerCol);
      if (typeCol) selectCols.push(typeCol);
      if (isSendCol) selectCols.push(isSendCol);

      const query = `SELECT ${selectCols.join(', ')} FROM ${table} LIMIT 100000`;
      const result = db.exec(query);

      if (result.length === 0) continue;

      for (const row of result[0].values) {
        let idx = 0;
        const content = row[idx++] as string;

        if (!content || content.trim() === '') continue;

        let timestamp = Date.now();
        let talker = '';
        let type = 1;
        let isSend = 0;

        if (timeCol) {
          const timeValue = row[idx++];
          // Convert timestamp - WeChat uses seconds
          if (typeof timeValue === 'number') {
            timestamp = timeValue > 1e12 ? timeValue : timeValue * 1000;
          }
        }
        if (talkerCol) talker = (row[idx++] as string) || '';
        if (typeCol) type = (row[idx++] as number) || 1;
        if (isSendCol) isSend = (row[idx++] as number) || 0;

        const isSelf = isSend === 1;

        messages.push({
          id: generateId(),
          senderId: talker,
          senderName: isSelf ? '我' : (contacts.get(talker) || talker || '对方'),
          content: content,
          timestamp: timestamp,
          type: getMessageType(type),
          isSelf: isSelf
        });
      }
    } catch (e) {
      console.warn(`Error reading table ${table}:`, e);
    }
  }

  return messages;
};

/**
 * Check if a file is a valid SQLite database
 */
export const isValidSqliteDb = (buffer: ArrayBuffer): boolean => {
  const header = new Uint8Array(buffer.slice(0, 16));
  // SQLite header: "SQLite format 3\0"
  const sqliteHeader = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
  
  for (let i = 0; i < sqliteHeader.length; i++) {
    if (header[i] !== sqliteHeader[i]) {
      return false;
    }
  }
  return true;
};

/**
 * Check if a database file is encrypted
 */
export const isEncryptedDb = (buffer: ArrayBuffer): boolean => {
  // If it's a valid SQLite header, it's not encrypted
  // If the header doesn't match, it's likely encrypted
  return !isValidSqliteDb(buffer);
};
