import { beforeEach, describe, expect, it } from 'vitest'
import { clearLlmConfig, getLlmConfig, initializeLlmConfig, setLlmConfig } from '@/lib/llmConfigStore'

describe('llmConfigStore', () => {
  beforeEach(() => {
    clearLlmConfig()
    localStorage.clear()
  })

  it('stores config in local storage so refreshes can restore it', () => {
    setLlmConfig({ baseUrl: ' http://example.com/v1 ', apiKey: ' sk-test ', model: ' m ' })

    expect(getLlmConfig()).toEqual({
      baseUrl: 'http://example.com/v1',
      apiKey: 'sk-test',
      model: 'm',
    })
    expect(localStorage.getItem('novwr_llm_config_v1')).toContain('http://example.com/v1')
  })

  it('clears config completely', () => {
    setLlmConfig({ baseUrl: 'http://example.com/v1', apiKey: 'sk-test', model: 'm' })
    clearLlmConfig()

    expect(getLlmConfig()).toEqual({ baseUrl: '', apiKey: '', model: '' })
    expect(localStorage.getItem('novwr_llm_config_v1')).toBeNull()
  })

  it('hydrates empty config fields from defaults', () => {
    setLlmConfig({ model: 'deepseek-chat' })

    expect(
      initializeLlmConfig({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-env',
        model: 'gpt-5.4',
      }),
    ).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-env',
      model: 'deepseek-chat',
    })
  })

  it('uses defaults when no local config exists', () => {
    expect(
      initializeLlmConfig({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-env',
        model: 'gpt-5.4',
      }),
    ).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-env',
      model: 'gpt-5.4',
    })
  })

  it('prefers saved config over defaults after refresh-like reinitialization', () => {
    setLlmConfig({
      baseUrl: 'https://saved.example/v1',
      apiKey: 'sk-saved',
      model: 'gpt-saved',
    })

    expect(
      initializeLlmConfig({
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-env',
        model: 'gpt-5.4',
      }),
    ).toEqual({
      baseUrl: 'https://saved.example/v1',
      apiKey: 'sk-saved',
      model: 'gpt-saved',
    })
  })
})
