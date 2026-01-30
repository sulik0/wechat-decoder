import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Upload, MessageCircle, Search, Download, FileText, Users, ChevronLeft, X, Filter, User, Terminal, Key, Database, ArrowRight, CheckCircle, Copy, Image as ImageIcon, FileCode, BookOpen } from 'lucide-react'
import { parseFile } from './utils/parser'
import { parseDbFile, isEncryptedDb } from './utils/db-parser'
import { decryptDatImage } from './utils/media'
import { exportSessionToHtml } from './utils/exporter'
import { formatMessageTime, formatSessionTime } from './utils/date'
import type { ParsedData, ChatSession } from './types'
import { TutorialPage } from './components/TutorialPage'

type ViewMode = 'home' | 'guide' | 'tutorial' | 'viewer'

function App() {
  const [data, setData] = useState<ParsedData | null>(null)
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [messageFilter, setMessageFilter] = useState<'all' | 'self' | 'other'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('home')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [mediaMap, setMediaMap] = useState<Record<string, string>>({})
  const mediaMapRef = useRef<Record<string, string>>({})

  // Keep ref in sync with state for cleanup
  useEffect(() => {
    mediaMapRef.current = mediaMap
  }, [mediaMap])

  // Cleanup object URLs only on unmount
  useEffect(() => {
    return () => {
      Object.values(mediaMapRef.current).forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  // Copy command to clipboard
  const copyCommand = useCallback((command: string, id: string) => {
    navigator.clipboard.writeText(command)
    setCopiedCommand(id)
    setTimeout(() => setCopiedCommand(null), 2000)
  }, [])

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    setIsLoading(true)
    setErrorMessage(null)
    
    try {
      const results: ParsedData = {
        sessions: [],
        totalMessages: 0,
        parseTime: 0,
      }
      
      const newMediaMap: Record<string, string> = { ...mediaMap }
      const filesArray = Array.from(files)
      
      // First pass: handle media files (.dat)
      for (const file of filesArray) {
        if (file.name.toLowerCase().endsWith('.dat')) {
          const buffer = new Uint8Array(await file.arrayBuffer())
          const decrypted = decryptDatImage(buffer)
          if (decrypted) {
            const url = URL.createObjectURL(decrypted.blob)
            newMediaMap[file.name] = url
            const stem = file.name.substring(0, file.name.lastIndexOf('.'))
            newMediaMap[stem] = url
          }
        }
      }
      
      setMediaMap(newMediaMap)

      // Second pass: handle data files (.db, .json, .csv, .txt)
      for (const file of filesArray) {
        const fileName = file.name.toLowerCase()
        
        if (fileName.endsWith('.dat')) {
          continue // Already handled
        }
        
        if (fileName.endsWith('.db')) {
          // Handle SQLite database file
          const buffer = await file.arrayBuffer()
          
          if (isEncryptedDb(buffer)) {
            setErrorMessage(`文件 "${file.name}" 是加密的数据库。\n请先使用 Python 脚本解密，或上传已解密的 *_decrypted.db 文件。`)
            continue
          }
          
          try {
            const parsed = await parseDbFile(buffer)
            results.sessions.push(...parsed.sessions)
            results.totalMessages += parsed.totalMessages
            results.parseTime += parsed.parseTime
          } catch (e) {
            setErrorMessage(`解析数据库失败: ${e instanceof Error ? e.message : '未知错误'}`)
          }
        } else {
          // Handle JSON, CSV, TXT files
          const parsed = await parseFile(file)
          results.sessions.push(...parsed.sessions)
          results.totalMessages += parsed.totalMessages
          results.parseTime += parsed.parseTime
        }
      }
      
      if (results.sessions.length > 0) {
        setData(prev => {
          if (!prev) return results
          return {
            sessions: [...prev.sessions, ...results.sessions],
            totalMessages: prev.totalMessages + results.totalMessages,
            parseTime: prev.parseTime + results.parseTime
          }
        })
        
        if (results.sessions.length === 1 && !data) {
          setSelectedSession(results.sessions[0])
        }
      }
    } catch (error) {
      console.error('Error parsing file:', error)
      setErrorMessage(`解析失败: ${error instanceof Error ? error.message : '未知错误'}`)
    } finally {
      setIsLoading(false)
    }
  }, [data, mediaMap])

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleFileUpload(e.dataTransfer.files)
  }, [handleFileUpload])

  // Filter messages
  const filteredMessages = useMemo(() => {
    if (!selectedSession) return []
    
    let messages = selectedSession.messages
    
    // Apply sender filter
    if (messageFilter === 'self') {
      messages = messages.filter(m => m.isSelf)
    } else if (messageFilter === 'other') {
      messages = messages.filter(m => !m.isSelf)
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      messages = messages.filter(m => 
        m.content.toLowerCase().includes(query) ||
        m.senderName.toLowerCase().includes(query)
      )
    }
    
    return messages
  }, [selectedSession, messageFilter, searchQuery])

  // Filter sessions by search
  const filteredSessions = useMemo(() => {
    if (!data || !searchQuery) return data?.sessions || []
    
    const query = searchQuery.toLowerCase()
    return data.sessions.filter(s =>
      s.name.toLowerCase().includes(query) ||
      s.messages.some(m => m.content.toLowerCase().includes(query))
    )
  }, [data, searchQuery])

  // Export to JSON
  const handleExport = useCallback(() => {
    if (!selectedSession) return
    
    const exportData = {
      name: selectedSession.name,
      messageCount: selectedSession.messageCount,
      messages: selectedSession.messages,
      exportTime: new Date().toISOString(),
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedSession.name}_聊天记录.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedSession])

  // Export to HTML
  const handleExportHtml = useCallback(() => {
    if (!selectedSession) return
    
    const html = exportSessionToHtml(selectedSession)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedSession.name}_聊天记录.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [selectedSession])

  // Reset state
  const handleReset = useCallback(() => {
    setData(null)
    setSelectedSession(null)
    setSearchQuery('')
    setMessageFilter('all')
    Object.values(mediaMap).forEach(url => URL.revokeObjectURL(url))
    setMediaMap({})
  }, [mediaMap])

  // Decrypt Guide Component
  const DecryptGuide = () => (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        <button onClick={() => setViewMode('home')} className="btn-secondary !p-2">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold">数据库解密指南</h1>
          <p className="text-sm text-muted-foreground">macOS / Windows</p>
        </div>
      </header>
      
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Intro */}
        <div className="card p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center flex-shrink-0">
              <Database className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-2">为什么需要解密？</h2>
              <p className="text-muted-foreground">
                微信将聊天记录存储在本地 SQLite 数据库中，但使用 SQLCipher 进行了加密。
                要读取聊天内容，需要先获取密钥并解密数据库。
              </p>
            </div>
          </div>
        </div>

        {/* macOS Steps */}
        <div className="card overflow-hidden">
          <div className="bg-muted px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              macOS 解密步骤
            </h3>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 font-semibold">
                1
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-2">安装 sqlcipher</h4>
                <div className="bg-muted rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                  <code>brew install sqlcipher</code>
                  <button
                    onClick={() => copyCommand('brew install sqlcipher', 'cmd1')}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                  >
                    {copiedCommand === 'cmd1' ? (
                      <CheckCircle className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 font-semibold">
                2
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-2">关闭 SIP（可选，用于自动提取密钥）</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  重启 Mac，按住 <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Command + R</kbd> 进入恢复模式，打开终端输入：
                </p>
                <div className="bg-muted rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                  <code>csrutil disable</code>
                  <button
                    onClick={() => copyCommand('csrutil disable', 'cmd2')}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                  >
                    {copiedCommand === 'cmd2' ? (
                      <CheckCircle className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 font-semibold">
                3
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-2">使用 lldb 提取密钥</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  启动微信并登录，然后在终端中执行：
                </p>
                <div className="space-y-2">
                  <div className="bg-muted rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                    <code>sudo lldb -p $(pgrep WeChat)</code>
                    <button
                      onClick={() => copyCommand('sudo lldb -p $(pgrep WeChat)', 'cmd3')}
                      className="p-1.5 hover:bg-accent rounded-md transition-colors"
                    >
                      {copiedCommand === 'cmd3' ? (
                        <CheckCircle className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <div className="bg-muted rounded-lg p-3 font-mono text-sm">
                    <code className="text-muted-foreground">(lldb)</code> br set -n sqlite3_key
                  </div>
                  <div className="bg-muted rounded-lg p-3 font-mono text-sm">
                    <code className="text-muted-foreground">(lldb)</code> c
                  </div>
                  <p className="text-sm text-muted-foreground">在微信中切换聊天触发断点后：</p>
                  <div className="bg-muted rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                    <code>memory read --size 1 --format x --count 32 $rsi</code>
                    <button
                      onClick={() => copyCommand('memory read --size 1 --format x --count 32 $rsi', 'cmd4')}
                      className="p-1.5 hover:bg-accent rounded-md transition-colors"
                    >
                      {copiedCommand === 'cmd4' ? (
                        <CheckCircle className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    * Apple Silicon (M1/M2) 芯片请使用 <code className="bg-muted px-1 rounded">$x1</code> 替代 <code className="bg-muted px-1 rounded">$rsi</code>
                  </p>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 font-semibold">
                4
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-2">运行解密脚本</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  或使用我们提供的 Python 脚本自动完成：
                </p>
                <div className="bg-muted rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                  <code>python3 scripts/decrypt_macos.py</code>
                  <button
                    onClick={() => copyCommand('python3 scripts/decrypt_macos.py', 'cmd5')}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                  >
                    {copiedCommand === 'cmd5' ? (
                      <CheckCircle className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Windows Steps */}
        <div className="card overflow-hidden">
          <div className="bg-muted px-6 py-4 border-b border-border">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Terminal className="w-5 h-5 text-blue-500" />
              Windows 解密步骤
            </h3>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0 font-semibold">
                1
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-2">安装依赖</h4>
                <div className="bg-muted rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                  <code>pip install pymem pycryptodome</code>
                  <button
                    onClick={() => copyCommand('pip install pymem pycryptodome', 'cmd6')}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                  >
                    {copiedCommand === 'cmd6' ? (
                      <CheckCircle className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center flex-shrink-0 font-semibold">
                2
              </div>
              <div className="flex-1">
                <h4 className="font-medium mb-2">以管理员身份运行解密脚本</h4>
                <div className="bg-muted rounded-lg p-3 font-mono text-sm flex items-center justify-between gap-2">
                  <code>python scripts/decrypt_windows.py</code>
                  <button
                    onClick={() => copyCommand('python scripts/decrypt_windows.py', 'cmd7')}
                    className="p-1.5 hover:bg-accent rounded-md transition-colors"
                  >
                    {copiedCommand === 'cmd7' ? (
                      <CheckCircle className="w-4 h-4 text-primary" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            输出文件
          </h3>
          <p className="text-muted-foreground mb-4">
            解密完成后，会在 <code className="bg-muted px-2 py-0.5 rounded">wechat_decrypted</code> 目录生成：
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <code className="bg-muted px-2 py-0.5 rounded">chat_records.json</code>
              <span className="text-muted-foreground">- 导出的聊天记录</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <code className="bg-muted px-2 py-0.5 rounded">*_decrypted.db</code>
              <span className="text-muted-foreground">- 解密后的数据库</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <code className="bg-muted px-2 py-0.5 rounded">key.txt</code>
              <span className="text-muted-foreground">- 保存的密钥</span>
            </li>
          </ul>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => setViewMode('home')}
            className="btn-primary text-lg px-8 py-3"
          >
            导入解密后的文件
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('tutorial')}
            className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <BookOpen className="w-4 h-4" />
            想深入了解原理？查看完整技术教程
          </button>
        </div>
      </div>
    </div>
  )

  // Home/Upload screen
  if (viewMode === 'guide') {
    return <DecryptGuide />
  }

  if (viewMode === 'tutorial') {
    return (
      <TutorialPage
        onBack={() => setViewMode('home')}
        onCopyCommand={copyCommand}
        copiedCommand={copiedCommand}
      />
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div 
          className={`card w-full max-w-2xl p-8 text-center transition-all duration-300 ${
            dragActive ? 'ring-2 ring-primary ring-offset-4 scale-[1.02]' : ''
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <div className="mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-glow">
              <MessageCircle className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold mb-3">微信聊天记录解析器</h1>
            <p className="text-muted-foreground">
              解密并查看微信本地聊天数据库
            </p>
          </div>

          <div className={`border-2 border-dashed rounded-2xl p-8 mb-6 transition-all ${
            dragActive 
              ? 'border-primary bg-accent' 
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}>
            <Upload className={`w-12 h-12 mx-auto mb-4 ${
              dragActive ? 'text-primary' : 'text-muted-foreground'
            }`} />
            <p className="text-lg font-medium mb-2">
              {dragActive ? '松开以上传文件' : '拖拽文件到此处'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              支持 DB、JSON、CSV、TXT、DAT 格式
            </p>
            <label className="btn-primary cursor-pointer">
              <FileText className="w-4 h-4" />
              选择文件
              <input
                type="file"
                className="hidden"
                accept=".db,.json,.csv,.txt,.dat"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
              />
            </label>
          </div>

          {/* Decrypt Guide Button */}
          <button
            onClick={() => setViewMode('guide')}
            className="w-full mb-3 p-4 rounded-xl border border-border bg-gradient-to-r from-accent to-muted hover:border-primary/50 transition-all text-left flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Key className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                如何解密微信数据库？
                <ArrowRight className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                查看解密步骤和快速开始指南
              </p>
            </div>
          </button>

          {/* Full Tutorial Button */}
          <button
            onClick={() => setViewMode('tutorial')}
            className="w-full mb-6 p-4 rounded-xl border border-border hover:border-primary/30 transition-all text-left flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                完整技术教程
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                深入理解加密原理、密钥提取和脚本实现
              </p>
            </div>
          </button>

          <div className="text-left bg-muted/50 rounded-xl p-4">
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              支持的数据格式
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>DB:</strong> 已解密的 SQLite 数据库文件 (*_decrypted.db)</li>
              <li>• <strong>JSON:</strong> 解密脚本导出的 chat_records.json</li>
              <li>• <strong>CSV:</strong> 包含消息内容、发送者、时间的表格</li>
              <li>• <strong>TXT:</strong> 纯文本对话记录</li>
              <li>• <strong>DAT:</strong> 微信图片加密文件（自动解密显示）</li>
            </ul>
          </div>
          
          {isLoading && (
            <div className="mt-6 flex items-center justify-center gap-2 text-primary">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>正在解析...</span>
            </div>
          )}
          
          {errorMessage && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm whitespace-pre-line">
              <div className="flex items-start gap-2">
                <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium mb-1">解析失败</div>
                  {errorMessage}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Main app with session list and chat view
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
        {selectedSession ? (
          <>
            <button 
              onClick={() => setSelectedSession(null)}
              className="btn-secondary !p-2 md:hidden"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold truncate">{selectedSession.name}</h1>
              <p className="text-sm text-muted-foreground">
                {filteredMessages.length} 条消息
              </p>
            </div>
          </>
        ) : (
          <>
            <MessageCircle className="w-6 h-6 text-primary" />
            <div className="flex-1">
              <h1 className="font-semibold">聊天记录</h1>
              <p className="text-sm text-muted-foreground">
                {data.sessions.length} 个会话，共 {data.totalMessages} 条消息
              </p>
            </div>
          </>
        )}
        
        <button onClick={handleReset} className="btn-secondary !p-2" title="重新导入">
          <X className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Session List */}
        <aside className={`w-full md:w-80 bg-card border-r border-border flex flex-col ${
          selectedSession ? 'hidden md:flex' : ''
        }`}>
          {/* Search */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="搜索会话或消息..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          
          {/* Session List */}
          <div className="flex-1 overflow-y-auto">
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedSession(session)}
                className={`w-full p-4 text-left border-b border-border transition-colors hover:bg-muted/50 ${
                  selectedSession?.id === session.id ? 'bg-accent' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                    session.isGroup 
                      ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
                      : 'bg-gradient-to-br from-primary to-primary-dark'
                  }`}>
                    {session.isGroup ? (
                      <Users className="w-6 h-6 text-white" />
                    ) : (
                      <User className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium truncate">{session.name}</span>
                      {session.lastMessageTime && (
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {formatSessionTime(session.lastMessageTime)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {session.lastMessage || '暂无消息'}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {session.messageCount} 条
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
            
            {filteredSessions.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>未找到匹配的会话</p>
              </div>
            )}
          </div>
        </aside>

        {/* Chat View */}
        <main className={`flex-1 flex flex-col bg-background ${
          !selectedSession ? 'hidden md:flex' : ''
        }`}>
          {selectedSession ? (
            <>
              {/* Toolbar */}
              <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setMessageFilter('all')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      messageFilter === 'all' 
                        ? 'bg-card shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    全部
                  </button>
                  <button
                    onClick={() => setMessageFilter('self')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      messageFilter === 'self' 
                        ? 'bg-card shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    我发送的
                  </button>
                  <button
                    onClick={() => setMessageFilter('other')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      messageFilter === 'other' 
                        ? 'bg-card shadow-sm text-foreground' 
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    对方发送的
                  </button>
                </div>
                
                <div className="flex-1" />
                
                <div className="flex gap-2">
                  <button onClick={handleExport} className="btn-secondary text-sm">
                    <Download className="w-4 h-4" />
                    导出 JSON
                  </button>
                  <button onClick={handleExportHtml} className="btn-secondary text-sm bg-primary/5 border-primary/20 text-primary hover:bg-primary/10">
                    <FileCode className="w-4 h-4" />
                    导出 HTML
                  </button>
                </div>
              </div>
              
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {filteredMessages.map((message, index) => {
                  const showTime = index === 0 || 
                    message.timestamp - filteredMessages[index - 1].timestamp > 300000

                  return (
                    <div key={message.id} className="animate-fade-in">
                      {showTime && (
                        <div className="text-center text-xs text-muted-foreground my-4">
                          {formatMessageTime(message.timestamp)}
                        </div>
                      )}
                      
                      {message.type === 'system' ? (
                        <div className="text-center text-xs text-muted-foreground bg-muted/50 rounded-full px-4 py-1.5 mx-auto w-fit">
                          {message.content}
                        </div>
                      ) : (
                        <div className={`flex ${message.isSelf ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex items-end gap-2 max-w-[85%] ${
                            message.isSelf ? 'flex-row-reverse' : ''
                          }`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-medium ${
                              message.isSelf 
                                ? 'bg-primary text-primary-foreground' 
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {message.senderName.charAt(0)}
                            </div>
                            <div>
                              {!message.isSelf && (
                                <div className="text-xs text-muted-foreground mb-1 ml-1">
                                  {message.senderName}
                                </div>
                              )}
                              <div className={message.isSelf ? 'chat-bubble-self' : 'chat-bubble-other'}>
                                {message.type === 'image' ? (
                                  <div className="relative group cursor-pointer">
                                    {mediaMap[message.content] || mediaMap[message.id] ? (
                                      <img 
                                        src={mediaMap[message.content] || mediaMap[message.id]} 
                                        alt="图片消息" 
                                        className="max-w-full rounded-md shadow-sm border border-border/50"
                                      />
                                    ) : (
                                      <div className="flex flex-col items-center gap-2 py-4 px-8 bg-muted/30 rounded-md border border-dashed border-border">
                                        <ImageIcon className="w-8 h-8 opacity-20" />
                                        <span className="text-xs opacity-50 text-center">
                                          图片未加载<br/>
                                          请上传对应 .dat 文件
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : message.type === 'voice' ? (
                                  <div className="text-sm opacity-80">[语音]</div>
                                ) : message.type === 'video' ? (
                                  <div className="text-sm opacity-80">[视频]</div>
                                ) : message.type === 'file' ? (
                                  <div className="text-sm opacity-80">[文件]</div>
                                ) : (
                                  <div className="whitespace-pre-wrap break-words">
                                    {message.content}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                
                {filteredMessages.length === 0 && (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Filter className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>没有匹配的消息</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg">选择一个会话查看聊天记录</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
