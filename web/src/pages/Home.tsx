// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { Link } from "react-router-dom"
import { Hero } from "@/components/home/Hero"
import { Features } from "@/components/home/Features"
import { SiteFooter } from "@/components/layout/SiteFooter"
import { NwButton } from "@/components/ui/nw-button"
import { useAuth } from "@/contexts/AuthContext"
import { useUiLocale } from "@/contexts/UiLocaleContext"

export function Home() {
    const { isLoggedIn } = useAuth()
    const { t } = useUiLocale()

    return (
        <div className="flex flex-col">
            <Hero />
            <Features />

            {/* CTA Section */}
            <section className="flex w-full flex-col items-center gap-6 px-12 py-24 text-center">
                <h2 className="font-mono text-4xl font-bold text-foreground">
                    {t('home.cta.title')}
                </h2>
                <p className="font-sans text-base text-muted-foreground">
                    {t('home.cta.description')}
                </p>
                <NwButton
                    asChild
                    variant="accent"
                    className="rounded-full px-8 py-3.5 text-base font-medium shadow-[0_0_24px_hsl(var(--accent)/0.4)]"
                >
                    <Link to={isLoggedIn ? "/library" : "/login"}>{t('home.cta.button')}</Link>
                </NwButton>
            </section>

            <SiteFooter />
        </div>
    )
}
