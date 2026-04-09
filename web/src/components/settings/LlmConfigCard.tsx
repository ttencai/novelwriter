import { useState, useEffect } from "react"
import { useUiLocale } from "@/contexts/UiLocaleContext"
import { getLlmApiErrorMessage, getLlmConfigWarning } from "@/lib/llmErrorMessages"
import { api, ApiError } from "@/services/api"
import { translateUiMessage } from "@/lib/uiMessages"
import { clearLlmConfig, getLlmConfig, initializeLlmConfig, setLlmConfig } from "@/lib/llmConfigStore"

const IS_HOSTED = (import.meta.env.VITE_DEPLOY_MODE || "selfhost") === "hosted"

export function LlmConfigCard() {
    const { locale, t } = useUiLocale()
    const [baseUrl, setBaseUrl] = useState("")
    const [apiKey, setApiKey] = useState("")
    const [model, setModel] = useState("")
    const [testing, setTesting] = useState(false)
    const [fetchingModels, setFetchingModels] = useState(false)
    const [models, setModels] = useState<string[]>([])
    const [showModelList, setShowModelList] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

    useEffect(() => {
        const config = getLlmConfig()
        setBaseUrl(config.baseUrl)
        setApiKey(config.apiKey)
        setModel(config.model)

        let cancelled = false
        api.getLlmConfigDefaults()
            .then((defaults) => {
                if (cancelled) return
                const merged = initializeLlmConfig({
                    baseUrl: defaults.base_url,
                    apiKey: defaults.api_key,
                    model: defaults.model,
                })
                setBaseUrl(merged.baseUrl)
                setApiKey(merged.apiKey)
                setModel(merged.model)
            })
            .catch(() => {
                // ignore defaults load failure; local tab state still works
            })

        return () => {
            cancelled = true
        }
    }, [])

    const save = () => {
        setLlmConfig({
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            model: model.trim(),
        })
    }

    const selectModel = (value: string) => {
        setModel(value)
        setLlmConfig({ model: value })
        setShowModelList(false)
        setResult({ ok: true, message: translateUiMessage(locale, 'llm.result.modelSelected', { model: value }) })
    }

    const partialConfigWarning = getLlmConfigWarning({
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
    }, locale)

    const testConnection = async () => {
        save()
        setTesting(true)
        setResult(null)
        try {
            const res = await api.testLlmConnection()
            if (res.ok) {
                setResult({ ok: true, message: res.message ?? translateUiMessage(locale, 'llm.result.successFallback', { latencyMs: res.latency_ms }) })
            } else {
                setResult({ ok: false, message: res.error ?? t('llm.result.connectionFailed') })
            }
        } catch (e) {
            if (e instanceof ApiError) {
                setResult({ ok: false, message: getLlmApiErrorMessage(e, locale) ?? translateUiMessage(locale, 'llm.result.httpFailed', { status: e.status }) })
            } else {
                setResult({ ok: false, message: e instanceof Error ? e.message : t('llm.result.connectionFailed') })
            }
        } finally {
            setTesting(false)
        }
    }

    const fetchModels = async () => {
        save()
        setFetchingModels(true)
        setResult(null)
        try {
            const res = await api.listLlmModels()
            const ids = res.models.map((item) => item.id)
            setModels(ids)
            setShowModelList(ids.length > 0)
            if (!model.trim() && ids.length > 0) {
                setModel(ids[0])
                setLlmConfig({ model: ids[0] })
            }
            setResult({ ok: true, message: translateUiMessage(locale, 'llm.result.modelsLoaded', { count: ids.length }) })
        } catch (e) {
            if (e instanceof ApiError) {
                setResult({ ok: false, message: getLlmApiErrorMessage(e, locale) ?? t('llm.result.modelsLoadFailed') })
            } else {
                setResult({ ok: false, message: e instanceof Error ? e.message : t('llm.result.modelsLoadFailed') })
            }
            setShowModelList(false)
        } finally {
            setFetchingModels(false)
        }
    }

    return (
        <div className="rounded-2xl border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] backdrop-blur-xl p-6 flex flex-col gap-5">
            {IS_HOSTED ? (
                <div className="rounded-2xl border border-[var(--nw-glass-border)] bg-white/5 px-4 py-3.5 text-sm leading-6 text-muted-foreground">
                    {t('llm.notice.hosted')}
                </div>
            ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                    {t('llm.notice.selfhost')}
                </p>
            )}

            {partialConfigWarning ? (
                <div className="rounded-lg border border-[hsl(var(--color-warning)/0.35)] bg-[hsl(var(--color-warning)/0.10)] px-3 py-2 text-sm text-[hsl(var(--color-warning))]">
                    {partialConfigWarning}
                </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="llm-base-url">
                    {t('llm.label.baseUrl')}
                </label>
                <input
                    id="llm-base-url"
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    onBlur={save}
                    placeholder="https://api.openai.com/v1"
                    className="h-10 rounded-lg border border-[var(--nw-glass-border)] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="llm-api-key">
                    {t('llm.label.apiKey')}
                </label>
                <input
                    id="llm-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onBlur={save}
                    placeholder="sk-..."
                    className="h-10 rounded-lg border border-[var(--nw-glass-border)] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
            </div>

            <div className="flex flex-col gap-1.5 relative">
                <label className="text-sm font-medium" htmlFor="llm-model">
                    {t('llm.label.model')}
                </label>
                <div className="flex gap-2">
                    <input
                        id="llm-model"
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        onFocus={() => setShowModelList(models.length > 0)}
                        onBlur={save}
                        placeholder="gpt-4o-mini"
                        className="h-10 flex-1 rounded-lg border border-[var(--nw-glass-border)] bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                    <button
                        type="button"
                        onClick={fetchModels}
                        disabled={fetchingModels || !baseUrl || !apiKey}
                        className="shrink-0 px-4 h-10 rounded-[10px] border border-[var(--nw-glass-border)] text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {fetchingModels ? t('llm.button.fetchingModels') : t('llm.button.fetchModels')}
                    </button>
                </div>
                {showModelList && models.length > 0 ? (
                    <div className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--nw-glass-border)] bg-[hsl(var(--background))] p-1 shadow-2xl">
                        {models.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => selectModel(item)}
                                className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[hsl(var(--muted))] ${item === model ? 'bg-[hsl(var(--muted))] text-accent' : 'text-foreground'}`}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            <button
                type="button"
                onClick={testConnection}
                disabled={testing || !baseUrl || !apiKey || !model}
                className="flex items-center justify-center h-10 rounded-[10px] border border-accent/25 text-accent hover:bg-accent/8 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
            >
                {testing ? t('llm.button.testing') : t('llm.button.test')}
            </button>

            <button
                type="button"
                onClick={() => {
                    clearLlmConfig()
                    setBaseUrl("")
                    setApiKey("")
                    setModel("")
                    setModels([])
                    setShowModelList(false)
                    setResult(null)
                }}
                className="flex items-center justify-center h-10 rounded-[10px] border border-[var(--nw-glass-border)] text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5"
            >
                {t('llm.button.clear')}
            </button>

            {result && (
                <div
                    className={`text-sm px-3 py-2 rounded-lg ${
                        result.ok
                            ? "bg-green-500/10 text-green-500"
                            : "bg-red-500/10 text-red-500"
                    }`}
                >
                    {result.message}
                </div>
            )}
        </div>
    )
}
