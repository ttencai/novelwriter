import { beforeEach, describe, it, expect } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { UiLocaleProvider } from '@/contexts/UiLocaleContext'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'

describe('useConfirmDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.lang = 'zh-CN'
  })

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(UiLocaleProvider, null, children)
  }

  it('starts closed', () => {
    const { result } = renderHook(() => useConfirmDialog(), { wrapper })
    expect(result.current.dialogProps.open).toBe(false)
  })

  it('confirm() opens dialog and resolves true on confirm', async () => {
    const { result } = renderHook(() => useConfirmDialog(), { wrapper })

    let resolved: boolean | undefined
    act(() => {
      result.current.confirm({ title: '删除？' }).then(v => { resolved = v })
    })

    expect(result.current.dialogProps.open).toBe(true)
    expect(result.current.dialogProps.title).toBe('删除？')
    expect(result.current.dialogProps.showCancel).toBe(true)

    act(() => result.current.dialogProps.onConfirm())
    await vi.waitFor(() => expect(resolved).toBe(true))
  })

  it('confirm() resolves false on close', async () => {
    const { result } = renderHook(() => useConfirmDialog(), { wrapper })

    let resolved: boolean | undefined
    act(() => {
      result.current.confirm({ title: 'test' }).then(v => { resolved = v })
    })

    act(() => result.current.dialogProps.onClose())
    await vi.waitFor(() => expect(resolved).toBe(false))
  })

  it('alert() opens dialog without cancel button', async () => {
    const { result } = renderHook(() => useConfirmDialog(), { wrapper })

    let alertDone = false
    act(() => {
      result.current.alert({ title: '提示' }).then(() => { alertDone = true })
    })

    expect(result.current.dialogProps.open).toBe(true)
    expect(result.current.dialogProps.showCancel).toBe(false)
    expect(result.current.dialogProps.confirmText).toBe('知道了')

    act(() => result.current.dialogProps.onConfirm())
    await vi.waitFor(() => expect(alertDone).toBe(true))
  })

  it('queues multiple dialogs', async () => {
    const { result } = renderHook(() => useConfirmDialog(), { wrapper })

    const results: boolean[] = []
    act(() => {
      result.current.confirm({ title: 'first' }).then(v => results.push(v))
      result.current.confirm({ title: 'second' }).then(v => results.push(v))
    })

    expect(result.current.dialogProps.title).toBe('first')

    act(() => result.current.dialogProps.onConfirm())
    await vi.waitFor(() => expect(result.current.dialogProps.title).toBe('second'))

    act(() => result.current.dialogProps.onClose())
    await vi.waitFor(() => expect(results).toEqual([true, false]))
  })

  it('uses English default button labels when the UI locale is en', async () => {
    localStorage.setItem('novwr_ui_locale', 'en')
    document.documentElement.lang = 'en'

    const { result } = renderHook(() => useConfirmDialog(), { wrapper })

    act(() => {
      result.current.alert({ title: 'Heads up' })
    })

    expect(result.current.dialogProps.confirmText).toBe('Got it')
  })
})
