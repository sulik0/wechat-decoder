import { ChatSession, ChatMessage } from '../types';
import { formatMessageTime } from './date';

/**
 * Generates a self-contained HTML file for a chat session.
 */
export const exportSessionToHtml = (session: ChatSession): string => {
  const { name, messages } = session;
  
  const messagesHtml = messages.map((msg, index) => {
    const showTime = index === 0 || msg.timestamp - messages[index - 1].timestamp > 300000;
    const timeHtml = showTime ? `<div class="time">${formatMessageTime(msg.timestamp)}</div>` : '';
    
    if (msg.type === 'system') {
      return `
        ${timeHtml}
        <div class="system-msg">
          <span>${msg.content}</span>
        </div>
      `;
    }

    const bubbleClass = msg.isSelf ? 'bubble-self' : 'bubble-other';
    const alignClass = msg.isSelf ? 'msg-self' : 'msg-other';
    const avatarChar = msg.senderName.charAt(0);
    const senderNameHtml = !msg.isSelf ? `<div class="sender-name">${msg.senderName}</div>` : '';

    let contentHtml = `<div class="text">${msg.content.replace(/\n/g, '<br>')}</div>`;
    if (msg.type === 'image') contentHtml = '<div class="media">[图片]</div>';
    else if (msg.type === 'voice') contentHtml = '<div class="media">[语音]</div>';
    else if (msg.type === 'video') contentHtml = '<div class="media">[视频]</div>';
    else if (msg.type === 'file') contentHtml = '<div class="media">[文件]</div>';

    return `
      ${timeHtml}
      <div class="msg-row ${alignClass}">
        <div class="avatar">${avatarChar}</div>
        <div class="msg-content">
          ${senderNameHtml}
          <div class="bubble ${bubbleClass}">
            ${contentHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name} - 微信聊天记录</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ebebeb;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        header {
            background-color: #ededed;
            padding: 15px;
            text-align: center;
            font-weight: bold;
            border-bottom: 1px solid #ddd;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .chat-area {
            padding: 15px;
            flex: 1;
        }
        .time {
            text-align: center;
            font-size: 12px;
            color: #999;
            margin: 20px 0 10px;
        }
        .system-msg {
            text-align: center;
            margin: 10px 0;
        }
        .system-msg span {
            background-color: #dadada;
            color: #fff;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .msg-row {
            display: flex;
            margin-bottom: 15px;
            align-items: flex-start;
        }
        .msg-other {
            flex-direction: row;
        }
        .msg-self {
            flex-direction: row-reverse;
        }
        .avatar {
            width: 40px;
            height: 40px;
            border-radius: 4px;
            background-color: #ccc;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            flex-shrink: 0;
        }
        .msg-self .avatar {
            background-color: #07c160;
        }
        .msg-content {
            margin: 0 10px;
            max-width: 70%;
        }
        .sender-name {
            font-size: 12px;
            color: #888;
            margin-bottom: 4px;
            margin-left: 2px;
        }
        .bubble {
            padding: 8px 12px;
            border-radius: 6px;
            position: relative;
            word-wrap: break-word;
            font-size: 15px;
            line-height: 1.5;
        }
        .bubble-other {
            background-color: #fff;
        }
        .bubble-other::before {
            content: "";
            position: absolute;
            left: -10px;
            top: 10px;
            border: 5px solid transparent;
            border-right-color: #fff;
        }
        .bubble-self {
            background-color: #95ec69;
        }
        .bubble-self::before {
            content: "";
            position: absolute;
            right: -10px;
            top: 10px;
            border: 5px solid transparent;
            border-left-color: #95ec69;
        }
        .text {
            white-space: pre-wrap;
        }
        .media {
            color: #888;
            font-style: italic;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>${name}</header>
        <div class="chat-area">
            ${messagesHtml}
        </div>
    </div>
</body>
</html>
  `;
};
