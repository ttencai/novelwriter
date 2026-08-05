import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContinuationSetupStage } from '@/components/studio/stages/ContinuationSetupStage'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import '@/lib/uiMessagePacks/novel'
import type { ContinuationMode } from '@/types/api'

const mockGetChapter = vi.fn()

vi.mock('@/services/api', () => ({
  api: {
    getChapter: (...args: unknown[]) => mockGetChapter(...args),
  },
}))

function Harness() {
  const [mode, setMode] = useState<ContinuationMode>('continue')
  const [instruction, setInstruction] = useState('')

  return (
    <ContinuationSetupStage
      novelId={1}
      chapterNum={2}
      chapterReference="第2章"
      instruction={instruction}
      onInstructionChange={setInstruction}
      mode={mode}
      onModeChange={setMode}
      selectedLength="4000"
      onSelectedLengthChange={vi.fn()}
      advancedOpen={false}
      onAdvancedOpenChange={vi.fn()}
      contextChapters="5"
      onContextChaptersChange={vi.fn()}
      numVersions="1"
      onNumVersionsChange={vi.fn()}
      temperature="0.8"
      onTemperatureChange={vi.fn()}
      onGenerate={vi.fn()}
    />
  )
}

function renderStage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <UiLocaleProvider>
        <Harness />
      </UiLocaleProvider>
    </QueryClientProvider>,
  )
}

describe('ContinuationSetupStage', () => {
  beforeEach(() => {
    localStorage.setItem('novwr_ui_locale', 'zh')
    mockGetChapter.mockResolvedValue({ content: '上一章正文' })
  })

  it('switches between continuation and draft polishing controls', async () => {
    const user = userEvent.setup()
    renderStage()

    expect(screen.getByRole('radio', { name: /续写/ })).toBeChecked()
    expect(screen.getByText('续写长度')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /偏润色/ }))

    expect(screen.getByRole('radio', { name: /偏润色/ })).toBeChecked()
    expect(screen.getByText('续写长度')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('粘贴草稿，可在前后补充润色、扩写或精简要求')).toBeInTheDocument()
    expect(screen.getByTestId('studio-generate-button')).toBeDisabled()

    await user.type(
      screen.getByPlaceholderText('粘贴草稿，可在前后补充润色、扩写或精简要求'),
      '草稿正文',
    )
    expect(screen.getByTestId('studio-generate-button')).toBeEnabled()
  })
})
