import { useRef, useEffect } from 'react'
import { cn, formatTime } from '../lib/utils'
import { useOrchestrationStore, Message } from '../stores/orchestration'
import {
  Bot,
  User,
  AlertCircle,
  Lightbulb,
  Zap,
  Info,
} from 'lucide-react'

const messageTypeConfig: Record<string, { icon: typeof Bot; bgColor: string; textColor: string }> = {
  user: {
    icon: User,
    bgColor: 'bg-primary-50 dark:bg-primary-900/20',
    textColor: 'text-primary-700 dark:text-primary-300',
  },
  thinking: {
    icon: Lightbulb,
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    textColor: 'text-amber-700 dark:text-amber-300',
  },
  action: {
    icon: Zap,
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    textColor: 'text-green-700 dark:text-green-300',
  },
  system: {
    icon: Info,
    bgColor: 'bg-gray-50 dark:bg-gray-700/50',
    textColor: 'text-gray-600 dark:text-gray-300',
  },
  error: {
    icon: AlertCircle,
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    textColor: 'text-red-700 dark:text-red-300',
  },
}

interface MessageItemProps {
  message: Message
}

function MessageItem({ message }: MessageItemProps) {
  const config = messageTypeConfig[message.type] || messageTypeConfig.system
  const Icon = config.icon

  return (
    <div className={cn('p-3 rounded-lg', config.bgColor)}>
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-lg bg-white/50 dark:bg-gray-800/50')}>
          <Icon className={cn('w-4 h-4', config.textColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-xs font-medium uppercase', config.textColor)}>
              {message.type}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatTime(message.timestamp)}
            </span>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    </div>
  )
}

export function AgentPanel() {
  const { messages, activeAgentId, agents } = useOrchestrationStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const activeAgent = activeAgentId ? agents[activeAgentId] : null

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h2 className="font-medium text-gray-900 dark:text-white">
          Agent Activity
        </h2>
        {activeAgent && (
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent" />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {activeAgent.name || activeAgentId}
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-2">
              No Activity Yet
            </h3>
            <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
              Start a conversation below to see agent activity and thought processes
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))
        )}
      </div>

      {/* Agent Status Bar */}
      <div className="h-10 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Active Agents:
          </span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {Object.keys(agents).length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Messages:
          </span>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            {messages.length}
          </span>
        </div>
      </div>
    </div>
  )
}
