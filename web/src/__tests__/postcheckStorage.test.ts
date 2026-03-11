import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addToWhitelist, getWhitelist } from '@/lib/postcheckWhitelistStorage'
import { getActiveWarnings, setActiveWarnings } from '@/lib/postcheckActiveWarningsStorage'

describe('postcheck storage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('stores whitelist terms per novel without duplicates', () => {
    addToWhitelist(1, '白龙马')
    addToWhitelist(1, '白龙马')
    addToWhitelist(2, '白龙马')

    expect(getWhitelist(1)).toEqual(['白龙马'])
    expect(getWhitelist(2)).toEqual(['白龙马'])
  })

  it('returns empty whitelist when storage contains malformed data', () => {
    localStorage.setItem('novwr_postcheck_whitelist_1', '{"bad":true}')

    expect(getWhitelist(1)).toEqual([])
  })

  it('keeps active warnings only when the chapter identity still matches', () => {
    const warnings = [
      {
        code: 'unknown_term_named',
        term: '白骨夫人',
        message: 'fallback',
        message_key: 'continuation.postcheck.warning.unknown_term_named',
        message_params: { term: '白骨夫人' },
        version: 1,
        evidence: null,
      },
      {
        code: 'unknown_address_token',
        term: '圣僧',
        message: 'fallback',
        message_key: 'continuation.postcheck.warning.unknown_address_token',
        message_params: { term: '圣僧' },
        version: 1,
        evidence: null,
      },
    ]

    setActiveWarnings(1, 3, warnings, '2026-03-09T00:00:00Z')

    expect(getActiveWarnings(1, 3, '2026-03-09T00:00:00Z')).toEqual(warnings)
    expect(getActiveWarnings(1, 3, '2026-03-10T00:00:00Z')).toEqual([])
    expect(localStorage.getItem('novwr_postcheck_active_1_3')).toBeNull()
  })

  it('drops legacy array payloads because they cannot prove chapter freshness', () => {
    localStorage.setItem(
      'novwr_postcheck_active_1_2',
      JSON.stringify([{ code: 'unknown_term_named', term: '悟空' }]),
    )

    expect(getActiveWarnings(1, 2, '2026-03-09T00:00:00Z')).toEqual([])
    expect(localStorage.getItem('novwr_postcheck_active_1_2')).toBeNull()
  })
})
