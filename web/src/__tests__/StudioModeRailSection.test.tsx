import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import '@/lib/uiMessagePacks/novel'
import { StudioModeRailSection } from '@/components/studio/rail/StudioModeRailSection'

describe('StudioModeRailSection', () => {
  it('shows a red dot when Atlas has additions or changes to review', () => {
    render(
      <UiLocaleProvider>
        <StudioModeRailSection
          activeStage="chapter"
          latestChapterReference="第 140 章"
          onContinuation={vi.fn()}
          onOpenAtlas={vi.fn()}
          hasAtlasUpdates
        />
      </UiLocaleProvider>,
    )

    expect(screen.getByTestId('studio-rail-atlas-update-dot')).toBeInTheDocument()
    expect(screen.getByTestId('studio-rail-atlas-update-dot')).toHaveAttribute(
      'aria-label',
      '有角色新增或变动待确认',
    )
  })
})
