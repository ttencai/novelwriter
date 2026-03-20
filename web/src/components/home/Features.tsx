import { Globe, Brain, GitBranch, type LucideIcon } from "lucide-react"
import { GlassCard } from "@/components/GlassCard"
import { useUiLocale } from "@/contexts/UiLocaleContext"

export function Features() {
    const { t } = useUiLocale()
    const features: {
        title: string
        description: string
        icon: LucideIcon
    }[] = [
        {
            title: t('home.features.worldModel.title'),
            description: t('home.features.worldModel.description'),
            icon: Globe,
        },
        {
            title: t('home.features.continuation.title'),
            description: t('home.features.continuation.description'),
            icon: Brain,
        },
        {
            title: t('home.features.compare.title'),
            description: t('home.features.compare.description'),
            icon: GitBranch,
        },
    ]

    return (
        <section id="features" className="w-full px-12 py-24">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-12">
                {/* Header */}
                <div className="flex flex-col items-center gap-3 text-center">
                    <h2 className="font-mono text-4xl font-bold text-foreground">
                        {t('home.features.title')}
                    </h2>
                    <p className="max-w-[500px] font-sans text-base leading-relaxed text-muted-foreground">
                        {t('home.features.description')}
                    </p>
                </div>

                {/* Cards */}
                <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
                    {features.map((feature) => (
                        <GlassCard
                            key={feature.title}
                            hoverable
                            className="p-8 flex flex-col gap-5"
                        >
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
                                <feature.icon className="h-6 w-6 text-accent" />
                            </div>
                            <h3 className="font-mono text-xl font-semibold text-foreground">
                                {feature.title}
                            </h3>
                            <p className="font-sans text-sm leading-[1.6] text-muted-foreground">
                                {feature.description}
                            </p>
                        </GlassCard>
                    ))}
                </div>
            </div>
        </section>
    )
}
