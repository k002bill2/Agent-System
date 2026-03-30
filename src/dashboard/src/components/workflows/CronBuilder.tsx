import { useMemo } from 'react'
import { Clock } from 'lucide-react'

interface CronBuilderProps {
  value: string
  onChange: (value: string) => void
}

interface CronPreset {
  label: string
  cron: string
  description: string
}

const PRESETS: CronPreset[] = [
  { label: '매시간', cron: '0 * * * *', description: '매시 정각' },
  { label: '매일 자정', cron: '0 0 * * *', description: '매일 00:00' },
  { label: '매일 9시', cron: '0 9 * * *', description: '매일 09:00' },
  { label: '매주 월요일', cron: '0 9 * * 1', description: '매주 월요일 09:00' },
  { label: '매월 1일', cron: '0 0 1 * *', description: '매월 1일 00:00' },
  { label: '15분마다', cron: '*/15 * * * *', description: '15분 간격' },
]

function describeCron(cron: string): string {
  const parts = cron.split(' ')
  if (parts.length !== 5) return cron

  const [minute, hour, day, _month, weekday] = parts

  // Check presets first
  const preset = PRESETS.find(p => p.cron === cron)
  if (preset) return preset.description

  let desc = ''

  if (minute.startsWith('*/')) {
    desc = `${minute.slice(2)}분마다`
  } else if (hour === '*' && minute !== '*') {
    desc = `매시 ${minute}분`
  } else if (hour !== '*' && minute !== '*') {
    desc = `${hour}시 ${minute}분`
    if (weekday !== '*') {
      const days = ['일', '월', '화', '수', '목', '금', '토']
      const dayIdx = parseInt(weekday)
      if (!isNaN(dayIdx) && dayIdx >= 0 && dayIdx < 7) {
        desc = `매주 ${days[dayIdx]}요일 ${desc}`
      }
    } else if (day !== '*') {
      desc = `매월 ${day}일 ${desc}`
    } else {
      desc = `매일 ${desc}`
    }
  } else {
    desc = cron
  }

  return desc
}

export function CronBuilder({ value, onChange }: CronBuilderProps) {
  const parts = value.split(' ')
  const minute = parts[0] || '*'
  const hour = parts[1] || '*'
  const day = parts[2] || '*'
  const month = parts[3] || '*'
  const weekday = parts[4] || '*'

  const humanReadable = useMemo(() => describeCron(value), [value])

  const updatePart = (index: number, val: string) => {
    const newParts = [...parts]
    while (newParts.length < 5) newParts.push('*')
    newParts[index] = val
    onChange(newParts.join(' '))
  }

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">프리셋</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(preset => (
            <button
              key={preset.cron}
              onClick={() => onChange(preset.cron)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                value === preset.cron
                  ? 'bg-primary-100 dark:bg-primary-900 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom cron input */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cron 표현식</label>
        <div className="grid grid-cols-5 gap-1.5">
          {[
            { label: 'Minute', value: minute, idx: 0 },
            { label: 'Hour', value: hour, idx: 1 },
            { label: 'Day', value: day, idx: 2 },
            { label: 'Month', value: month, idx: 3 },
            { label: 'Weekday', value: weekday, idx: 4 },
          ].map(field => (
            <div key={field.idx}>
              <span className="block text-[10px] text-gray-400 mb-0.5">{field.label}</span>
              <input
                value={field.value}
                onChange={e => updatePart(field.idx, e.target.value)}
                className="w-full px-1.5 py-1 text-xs text-center border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 dark:bg-gray-900 rounded text-xs">
        <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className="text-gray-600 dark:text-gray-400">{humanReadable}</span>
      </div>
    </div>
  )
}
