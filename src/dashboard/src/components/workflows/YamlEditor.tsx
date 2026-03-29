import { useState, useCallback, useEffect } from 'react'
import yaml from 'js-yaml'
import { AlertCircle, Eye, Code, Copy, Check } from 'lucide-react'

interface YamlEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}

interface YamlError {
  message: string
  line?: number
}

export function YamlEditor({ value, onChange, readOnly = false }: YamlEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [error, setError] = useState<YamlError | null>(null)
  const [copied, setCopied] = useState(false)
  const [parsedPreview, setParsedPreview] = useState<string>('')

  const validate = useCallback((content: string) => {
    try {
      if (content.trim()) {
        const parsed = yaml.load(content)
        setParsedPreview(JSON.stringify(parsed, null, 2))
      }
      setError(null)
      return true
    } catch (e: unknown) {
      const err = e as { mark?: { line: number }; message?: string }
      const mark = err.mark
      setError({
        message: err.message || 'Invalid YAML',
        line: mark ? mark.line + 1 : undefined,
      })
      return false
    }
  }, [])

  useEffect(() => {
    validate(value)
  }, [value, validate])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    onChange(newValue)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const lines = value.split('\n')

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode('edit')}
            className={`px-2 py-1 text-xs rounded ${
              mode === 'edit'
                ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Code className="w-3 h-3 inline mr-1" />
            Edit
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`px-2 py-1 text-xs rounded ${
              mode === 'preview'
                ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <Eye className="w-3 h-3 inline mr-1" />
            Preview
          </button>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error.line ? `Line ${error.line}: ` : ''}Error
            </span>
          )}
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Editor / Preview */}
      {mode === 'edit' ? (
        <div className="relative">
          {/* Line numbers */}
          <div className="absolute left-0 top-0 bottom-0 w-10 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 text-right overflow-hidden">
            <div className="py-3 px-1">
              {lines.map((_, i) => (
                <div
                  key={i}
                  className={`text-xs leading-5 ${
                    error?.line === i + 1
                      ? 'text-red-500 font-bold bg-red-50 dark:bg-red-900/20'
                      : 'text-gray-400'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
          </div>
          <textarea
            value={value}
            onChange={handleChange}
            readOnly={readOnly}
            className="w-full min-h-[300px] p-3 pl-12 text-sm bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 resize-y focus:outline-none leading-5"
            spellCheck={false}
            placeholder="# Workflow YAML definition..."
          />
        </div>
      ) : (
        <pre className="p-3 min-h-[300px] text-sm bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 overflow-auto">
          {error ? (
            <span className="text-red-500">{error.message}</span>
          ) : (
            parsedPreview || '// Empty'
          )}
        </pre>
      )}
    </div>
  )
}
