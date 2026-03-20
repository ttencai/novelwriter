import { Link } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useUiLocale } from "@/contexts/UiLocaleContext"
import { NwButton } from "@/components/ui/nw-button"

export function Hero() {
    const { isLoggedIn } = useAuth()
    const { t } = useUiLocale()

    return (
        <section className="flex w-full min-h-[600px] items-center justify-center px-12 py-[120px]">
            <div className="flex max-w-[800px] flex-col items-center gap-8 text-center">
                <h1 className="font-mono text-[56px] font-bold leading-[1.2] text-foreground">
                    {t('home.hero.title')}
                </h1>

                <p className="max-w-[640px] font-sans text-lg leading-[1.6] text-muted-foreground">
                    {t('home.hero.description')}
                </p>

                <NwButton
                    asChild
                    variant="accent"
                    className="rounded-full px-8 py-3.5 text-base font-medium shadow-[0_0_24px_hsl(var(--accent)/0.4)]"
                >
                    <Link to={isLoggedIn ? "/library" : "/login"}>{t('home.hero.cta')}</Link>
                </NwButton>
            </div>
        </section>
    )
}
