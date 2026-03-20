/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyUiLocaleToDocument,
  normalizeUiLocale,
  persistUiLocale,
  resolveInitialUiLocale,
} from '@/lib/uiLocale'
import {
  translateUiMessage,
  type UiLocale,
  type UiMessageKey,
  type UiMessageParams,
} from '@/lib/uiMessages'

interface UiLocaleContextValue {
  locale: UiLocale
  setLocale: (locale: UiLocale) => void
  t: (key: UiMessageKey, params?: UiMessageParams) => string
}

const UiLocaleContext = createContext<UiLocaleContextValue | undefined>(undefined)

export function UiLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(resolveInitialUiLocale)

  useEffect(() => {
    applyUiLocaleToDocument(locale)
    persistUiLocale(locale)
  }, [locale])

  const setLocale = useCallback((nextLocale: UiLocale) => {
    setLocaleState(normalizeUiLocale(nextLocale))
  }, [])

  const t = useCallback((key: UiMessageKey, params?: UiMessageParams) => {
    return translateUiMessage(locale, key, params)
  }, [locale])

  const value = useMemo(() => ({
    locale,
    setLocale,
    t,
  }), [locale, setLocale, t])

  return (
    <UiLocaleContext.Provider value={value}>
      {children}
    </UiLocaleContext.Provider>
  )
}

export function useUiLocale() {
  const context = useContext(UiLocaleContext)
  if (!context) {
    throw new Error('useUiLocale must be used within a UiLocaleProvider')
  }
  return context
}
