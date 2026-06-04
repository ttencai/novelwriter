import { beforeEach, describe, expect, it } from 'vitest'
import {
  readGenerationResultsDebug,
  saveGenerationResultsDebug,
} from '@/lib/generationResultsDebugStorage'
import type { ContinueDebugSummary } from '@/types/api'

function debugWithSystem(system: string): ContinueDebugSummary {
  return {
    context_chapters: 1,
    injected_systems: [system],
    injected_entities: [],
    injected_relationships: [],
    relevant_entity_ids: [],
    ambiguous_keywords_disabled: [],
    drift_warnings: [],
    prose_warnings: [],
  }
}

describe('generationResultsDebugStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('keeps continuation debug data isolated by novel id', () => {
    saveGenerationResultsDebug(1, '0:100', debugWithSystem('第一本设定'))
    saveGenerationResultsDebug(2, '0:100', debugWithSystem('第二本设定'))

    expect(readGenerationResultsDebug(1, '0:100')?.injected_systems).toEqual(['第一本设定'])
    expect(readGenerationResultsDebug(2, '0:100')?.injected_systems).toEqual(['第二本设定'])
  })
})
