import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { NovelCopilotProvider } from '@/components/novel-copilot/NovelCopilotProvider'
import { useUiLocale } from '@/contexts/UiLocaleContext'
import {
  parseNovelShellRouteState,
} from './NovelShellRouteState'
import { NovelShellContext } from './NovelShellContext'
import {
  clampNovelShellDrawerWidth,
  DEFAULT_NOVEL_SHELL_DRAWER_WIDTH,
} from './novelShellChromeState'

export function NovelShellProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { locale } = useUiLocale()
  // Route-parse + shell chrome live here; page modules keep their own server data and edit buffers.
  const routeState = useMemo(
    () => parseNovelShellRouteState(location.pathname, location.search),
    [location.pathname, location.search],
  )
  const [drawerWidth, setDrawerWidthState] = useState(DEFAULT_NOVEL_SHELL_DRAWER_WIDTH)

  const setDrawerWidth = useCallback((nextWidth: number) => {
    setDrawerWidthState(clampNovelShellDrawerWidth(nextWidth))
  }, [])

  const value = useMemo(() => ({
    routeState,
    shellState: {
      drawerWidth,
      setDrawerWidth,
    },
  }), [drawerWidth, routeState, setDrawerWidth])

  return (
    <NovelShellContext.Provider value={value}>
      <NovelCopilotProvider
        key={`${routeState.novelId ?? 'none'}:${locale}`}
        novelId={routeState.novelId}
        interactionLocale={locale}
      >
        {children}
      </NovelCopilotProvider>
    </NovelShellContext.Provider>
  )
}
