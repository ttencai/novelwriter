import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import { Home } from '@/pages/Home'
import Settings from '@/pages/Settings'
import Terms from '@/pages/Terms'

const authState = vi.hoisted(() => ({
  value: {
    isLoggedIn: false,
    user: null,
    logout: vi.fn(),
    refreshQuota: vi.fn(),
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState.value,
}))

function setEnglishLocale() {
  localStorage.setItem('novwr_ui_locale', 'en')
  document.documentElement.lang = 'en'
}

function renderWithLocale(element: ReactNode) {
  return render(
    <UiLocaleProvider>
      <MemoryRouter>{element}</MemoryRouter>
    </UiLocaleProvider>,
  )
}

describe('public locale surfaces', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = 'zh-CN'
    authState.value = {
      isLoggedIn: false,
      user: null,
      logout: vi.fn(),
      refreshQuota: vi.fn(),
    }
  })

  it('renders the marketing home copy in English', () => {
    setEnglishLocale()

    renderWithLocale(<Home />)

    expect(screen.getByRole('heading', { name: 'Continue your story inside a complete world model' })).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Start writing' })[0]).toBeVisible()
    expect(screen.getByRole('link', { name: 'Terms of use' })).toBeVisible()
  })

  it('renders the settings surface in English', () => {
    setEnglishLocale()
    authState.value = {
      isLoggedIn: true,
      user: {
        id: 1,
        username: 'omega',
        display_name: 'Omega',
        generation_quota: 5,
      },
      logout: vi.fn(),
      refreshQuota: vi.fn(),
    }

    renderWithLocale(<Settings />)

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible()
    expect(screen.getByText('Interface language')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeVisible()
    expect(screen.getByText('Nickname')).toBeVisible()
    expect(screen.getByText('Log out')).toBeVisible()
  })

  it('renders the legal terms page in English', () => {
    setEnglishLocale()

    renderWithLocale(<Terms />)

    expect(screen.getByRole('heading', { name: 'Terms of use' })).toBeVisible()
    expect(screen.getByText('Before using the service, we also recommend reading the', { exact: false })).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Privacy notice' })[0]).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Copyright notice' })[0]).toBeVisible()
  })
})
