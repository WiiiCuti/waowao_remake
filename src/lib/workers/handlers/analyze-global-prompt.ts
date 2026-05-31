import { buildCharactersLibInfo, type CharacterBrief } from './analyze-global-parse'
import type { Locale } from '@/i18n/routing'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'

export type AnalyzeGlobalPromptTemplates = {
  characterPromptTemplate: string
  locationPromptTemplate: string
  propPromptTemplate: string
}

export function loadAnalyzeGlobalPromptTemplates(locale: Locale): AnalyzeGlobalPromptTemplates {
  return {
    characterPromptTemplate: getPromptTemplate(PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE, locale),
    locationPromptTemplate: getPromptTemplate(PROMPT_IDS.NP_SELECT_LOCATION, locale),
    propPromptTemplate: getPromptTemplate(PROMPT_IDS.NP_SELECT_PROP, locale),
  }
}

export function buildAnalyzeGlobalPrompts(params: {
  chunk: string
  templates: AnalyzeGlobalPromptTemplates
  existingCharacters: CharacterBrief[]
  existingLocationInfo: string[]
  existingPropNames: string[]
  locale?: Locale
}) {
  const rawLocale = params.locale === 'en' ? 'en' : 'zh'
  const t_none = rawLocale === 'en' ? 'None' : '无'
  const sep = rawLocale === 'en' ? ', ' : '、'

  const characterPrompt = params.templates.characterPromptTemplate
    .replace('{input}', params.chunk)
    .replace('{characters_lib_info}', buildCharactersLibInfo(params.existingCharacters, rawLocale))
  const locationPrompt = params.templates.locationPromptTemplate
    .replace('{input}', params.chunk)
    .replace('{locations_lib_name}', params.existingLocationInfo.join(sep) || t_none)
  const propPrompt = params.templates.propPromptTemplate
    .replace('{input}', params.chunk)
    .replace('{props_lib_name}', params.existingPropNames.join(sep) || t_none)
  return {
    characterPrompt,
    locationPrompt,
    propPrompt,
  }
}
