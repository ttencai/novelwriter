import { useState } from "react"
import { X } from "lucide-react"
import { useUiLocale } from "@/contexts/UiLocaleContext"
import { NwButton } from "@/components/ui/nw-button"

function RadioGroup({ name, options, value, onChange }: {
    name: string
    options: { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="flex flex-col gap-2">
            {options.map(opt => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                        value === opt.value
                            ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]'
                            : 'border-muted-foreground/40 group-hover:border-muted-foreground/60'
                    }`}>
                        {value === opt.value && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <input
                        type="radio"
                        name={name}
                        value={opt.value}
                        checked={value === opt.value}
                        onChange={() => onChange(opt.value)}
                        className="sr-only"
                    />
                    <span className="text-[13px]">{opt.label}</span>
                </label>
            ))}
        </div>
    )
}

function CheckboxGroup({ options, selected, onChange }: {
    options: { value: string; label: string }[]
    selected: string[]
    onChange: (v: string[]) => void
}) {
    const toggle = (value: string) => {
        if (value === "none") {
            onChange(selected.includes("none") ? [] : ["none"])
            return
        }
        const without = selected.filter(v => v !== "none")
        if (without.includes(value)) {
            onChange(without.filter(v => v !== value))
        } else {
            onChange([...without, value])
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {options.map(opt => {
                const checked = selected.includes(opt.value)
                return (
                    <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                        <div className={`h-4 w-4 rounded-[4px] border-2 flex items-center justify-center transition-colors ${
                            checked
                                ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]'
                                : 'border-muted-foreground/40 group-hover:border-muted-foreground/60'
                        }`}>
                            {checked && (
                                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            )}
                        </div>
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(opt.value)}
                            className="sr-only"
                        />
                        <span className="text-[13px]">{opt.label}</span>
                    </label>
                )
            })}
        </div>
    )
}

/** Trim whitespace, count length and unique chars */
function suggestionQualifies(text: string): boolean {
    const trimmed = text.replace(/\s+/g, "")
    if (trimmed.length < 20) return false
    const unique = new Set(trimmed)
    return unique.size >= 6
}

export interface FeedbackAnswers {
    overall_rating: string
    issues: string[]
    bug_description?: string
    other_description?: string
    suggestion?: string
}

export function FeedbackForm({ onSubmit, onCancel, submitting }: {
    onSubmit: (answers: FeedbackAnswers) => void
    onCancel: () => void
    submitting: boolean
}) {
    const { t } = useUiLocale()
    const [rating, setRating] = useState("")
    const [issues, setIssues] = useState<string[]>([])
    const [bugDesc, setBugDesc] = useState("")
    const [otherDesc, setOtherDesc] = useState("")
    const [suggestion, setSuggestion] = useState("")

    const hasBugs = issues.includes("bugs")
    const hasOther = issues.includes("other")
    const bonusQualified = suggestionQualifies(suggestion)
    const ratingOptions = [
        { value: "great", label: t('feedback.rating.great') },
        { value: "good", label: t('feedback.rating.good') },
        { value: "okay", label: t('feedback.rating.okay') },
        { value: "poor", label: t('feedback.rating.poor') },
    ]
    const issueOptions = [
        { value: "speed", label: t('feedback.issue.speed') },
        { value: "quality", label: t('feedback.issue.quality') },
        { value: "ux", label: t('feedback.issue.ux') },
        { value: "bugs", label: t('feedback.issue.bugs') },
        { value: "other", label: t('feedback.issue.other') },
        { value: "none", label: t('feedback.issue.none') },
    ]

    const canSubmit =
        rating !== "" &&
        issues.length > 0 &&
        (!hasBugs || bugDesc.trim().length > 0) &&
        (!hasOther || otherDesc.trim().length > 0)

    const handleSubmit = () => {
        const answers: FeedbackAnswers = {
            overall_rating: rating,
            issues,
        }
        if (hasBugs) answers.bug_description = bugDesc.trim()
        if (hasOther) answers.other_description = otherDesc.trim()
        const trimmedSuggestion = suggestion.trim()
        if (trimmedSuggestion) answers.suggestion = trimmedSuggestion
        onSubmit(answers)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[480px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--nw-glass-border)] bg-[hsl(var(--nw-modal-bg))] backdrop-blur-xl p-8 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{t('feedback.title')}</h3>
                    <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <p className="text-[13px] text-muted-foreground">
                    {t('feedback.description')}
                </p>

                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">{t('feedback.question.rating')}</span>
                    <RadioGroup name="overall_rating" options={ratingOptions} value={rating} onChange={setRating} />
                </div>

                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">{t('feedback.question.issues')}</span>
                    <CheckboxGroup options={issueOptions} selected={issues} onChange={setIssues} />

                    {hasBugs && (
                        <textarea
                            value={bugDesc}
                            onChange={e => setBugDesc(e.target.value)}
                            placeholder={t('feedback.placeholder.bug')}
                            className="mt-1 w-full min-h-[60px] rounded-lg border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                        />
                    )}

                    {hasOther && (
                        <textarea
                            value={otherDesc}
                            onChange={e => setOtherDesc(e.target.value)}
                            placeholder={t('feedback.placeholder.other')}
                            className="mt-1 w-full min-h-[60px] rounded-lg border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                        />
                    )}
                </div>

                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">{t('feedback.question.suggestion')}</span>
                    <textarea
                        value={suggestion}
                        onChange={e => setSuggestion(e.target.value)}
                        placeholder={t('feedback.placeholder.suggestion')}
                        className="w-full min-h-[80px] rounded-lg border border-[var(--nw-glass-border)] bg-[var(--nw-glass-bg)] px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-1 focus:ring-[hsl(var(--accent))]"
                    />
                    <p className={`text-[12px] transition-colors ${bonusQualified ? 'text-[hsl(var(--accent))]' : 'text-muted-foreground/60'}`}>
                        {bonusQualified
                            ? t('feedback.bonus.max')
                            : t('feedback.bonus.upgrade')}
                    </p>
                </div>

                <NwButton
                    variant="accent"
                    onClick={handleSubmit}
                    disabled={!canSubmit || submitting}
                    className="w-full h-11 rounded-xl font-medium text-sm"
                >
                    {submitting ? t('feedback.submit.loading') : t('feedback.submit.button', { count: bonusQualified ? 30 : 20 })}
                </NwButton>
            </div>
        </div>
    )
}
