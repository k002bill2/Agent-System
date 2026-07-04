import { memo } from 'react'

import { LLMAccessCardHeader } from './llm-access/LLMAccessCard'
import { LLMAccessContent } from './llm-access/LLMAccessContent'
import { useLLMAccessSettingsModel } from './llm-access/useLLMAccessSettingsModel'

export const LLMAccessSettings = memo(function LLMAccessSettings() {
  const model = useLLMAccessSettingsModel()

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <LLMAccessCardHeader
        loading={model.loading}
        onRefresh={model.handleRefresh}
      />
      <LLMAccessContent model={model} />
    </div>
  )
})

LLMAccessSettings.displayName = 'LLMAccessSettings'
