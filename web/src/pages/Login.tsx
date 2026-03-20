// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only
/* eslint-disable react-refresh/only-export-components */

import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { Github } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/contexts/AuthContext"
import { useUiLocale } from "@/contexts/UiLocaleContext"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useConfirmDialog } from "@/hooks/useConfirmDialog"
import { AnimatedBackground } from "@/components/layout/AnimatedBackground"
import { translateUiMessage, type UiLocale } from "@/lib/uiMessages"
import { NwButton } from "@/components/ui/nw-button"
import { ApiError, api } from "@/services/api"

const DEFAULT_POST_LOGIN_DESTINATION = "/library"

function isHostedDeployMode(): boolean {
    return (import.meta.env.VITE_DEPLOY_MODE || "selfhost") === "hosted"
}

function resolveSafeClientRedirect(value: string | null | undefined): string {
    const candidate = (value || "").trim()
    if (!candidate || candidate.includes("\\") || candidate.includes("\u0000")) return DEFAULT_POST_LOGIN_DESTINATION

    try {
        const url = new URL(candidate, "http://novwr.local")
        if (url.origin !== "http://novwr.local") return DEFAULT_POST_LOGIN_DESTINATION
        if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return DEFAULT_POST_LOGIN_DESTINATION
        if (url.pathname.startsWith("/login") || url.pathname.startsWith("/api")) return DEFAULT_POST_LOGIN_DESTINATION
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return DEFAULT_POST_LOGIN_DESTINATION
    }
}

export function getPostLoginDestination(state: unknown, search = ""): string {
    if (state && typeof state === "object" && "from" in state) {
        const from = state.from
        if (typeof from === "string" && from.trim()) {
            return resolveSafeClientRedirect(from)
        }
    }

    const redirectTo = new URLSearchParams(search).get("redirect_to")
    return resolveSafeClientRedirect(redirectTo)
}

export function getOAuthErrorMessage(code: string | null, locale: UiLocale = 'zh'): string | null {
    switch (code) {
        case "github_oauth_not_configured":
            return translateUiMessage(locale, 'login.oauth.githubNotConfigured')
        case "github_oauth_state_invalid":
            return translateUiMessage(locale, 'login.oauth.stateInvalid')
        case "github_oauth_access_denied":
            return translateUiMessage(locale, 'login.oauth.accessDenied')
        case "github_oauth_signup_blocked":
            return translateUiMessage(locale, 'login.oauth.signupBlocked')
        case "github_oauth_account_disabled":
            return translateUiMessage(locale, 'login.oauth.accountDisabled')
        case "github_oauth_failed":
            return translateUiMessage(locale, 'login.oauth.failed')
        default:
            return null
    }
}

export default function Login() {
    const isHosted = isHostedDeployMode()
    const { locale, t } = useUiLocale()

    // Hosted mode fields
    const [inviteCode, setInviteCode] = useState("")
    const [nickname, setNickname] = useState("")

    // Selfhost mode fields
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")

    const [isLoading, setIsLoading] = useState(false)
    const { login, inviteRegister } = useAuth()
    const location = useLocation()
    const navigate = useNavigate()
    const { alert, dialogProps } = useConfirmDialog()
    const postLoginDestination = getPostLoginDestination(location.state, location.search)
    const searchParams = new URLSearchParams(location.search)
    const oauthErrorMessage = getOAuthErrorMessage(searchParams.get("oauth_error"), locale)
    const githubLoginUrl = api.getGitHubLoginUrl(postLoginDestination)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        setIsLoading(true)
        try {
            if (isHosted) {
                if (!inviteCode || !nickname) return
                await inviteRegister(inviteCode, nickname)
            } else {
                if (!username || !password) return
                await login(username, password)
            }
            navigate(postLoginDestination, { replace: true })
        } catch (err) {
            if (err instanceof ApiError) {
                const requestIdSuffix = err.requestId ? t('login.requestIdSuffix', { requestId: err.requestId }) : ""

                if (isHosted && err.status === 403) {
                    await alert({ title: t('login.alert.invalidInvite.title'), description: `${t('login.alert.invalidInvite.description')}${requestIdSuffix}` })
                } else if (isHosted && err.status === 503 && err.code === "hosted_user_cap_reached") {
                    await alert({ title: t('login.alert.signupBlocked.title'), description: `${t('login.alert.signupBlocked.description')}${requestIdSuffix}` })
                } else if (err.status === 401) {
                    await alert({ title: t('login.alert.invalidCredentials.title'), description: `${t('login.alert.invalidCredentials.description')}${requestIdSuffix}` })
                } else if (err.status === 404) {
                    await alert({
                        title: t('login.alert.backend404.title'),
                        description: `${t('login.alert.backend404.description')}${requestIdSuffix}`,
                    })
                } else {
                    await alert({
                        title: t('login.alert.httpFailure.title'),
                        description: `${t('login.alert.httpFailure.description', { status: err.status })}${requestIdSuffix}`,
                    })
                }
                return
            }

            await alert({
                title: t('login.alert.network.title'),
                description: t('login.alert.network.description'),
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="min-h-screen grid items-center justify-center relative overflow-hidden">
            <AnimatedBackground />

            <div className="w-[420px] z-10 rounded-[20px] p-10 bg-[var(--nw-glass-bg)] backdrop-blur-[24px] border border-[var(--nw-glass-border)] flex flex-col gap-8">
                {/* Header */}
                <div className="flex flex-col gap-3 w-full">
                    <span className="font-mono text-[28px] font-bold text-foreground">NovWr</span>
                    <span className="font-sans text-[15px] text-muted-foreground">
                        {isHosted ? t('login.header.hosted') : t('login.header.selfhost')}
                    </span>
                </div>

                {oauthErrorMessage ? (
                    <div className="rounded-xl border border-[hsl(var(--color-danger)/0.28)] bg-[hsl(var(--color-danger)/0.10)] px-4 py-3 text-sm text-foreground">
                        {oauthErrorMessage}
                    </div>
                ) : null}

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-5 w-full" data-testid="login-form">
                    {isHosted ? (
                        <>
                            <NwButton
                                asChild
                                variant="glass"
                                className="h-11 w-full rounded-xl border-[var(--nw-glass-border)] bg-[hsl(var(--background)/0.5)] text-sm font-medium"
                            >
                                <a href={githubLoginUrl} data-testid="login-github-link">
                                    <Github className="h-4 w-4" />
                                    {t('login.github.button')}
                                </a>
                            </NwButton>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <div className="h-px flex-1 bg-[var(--nw-glass-border)]" />
                                <span>{t('login.invite.or')}</span>
                                <div className="h-px flex-1 bg-[var(--nw-glass-border)]" />
                            </div>

                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium leading-none" htmlFor="invite-code">
                                    {t('login.invite.code.label')}
                                </label>
                                <Input
                                    id="invite-code"
                                    type="text"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value)}
                                    placeholder={t('login.invite.code.placeholder')}
                                    className="border-[var(--nw-glass-border)] bg-transparent rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-accent"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium leading-none" htmlFor="nickname">
                                    {t('login.invite.nickname.label')}
                                </label>
                                <Input
                                    id="nickname"
                                    type="text"
                                    value={nickname}
                                    onChange={(e) => setNickname(e.target.value)}
                                    placeholder={t('login.invite.nickname.placeholder')}
                                    className="border-[var(--nw-glass-border)] bg-transparent rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-accent"
                                    required
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium leading-none" htmlFor="username">
                                    {t('login.username.label')}
                                </label>
                                <Input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="border-[var(--nw-glass-border)] bg-transparent rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-accent"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 w-full">
                                <label className="text-sm font-medium leading-none" htmlFor="password">
                                    {t('login.password.label')}
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="border-[var(--nw-glass-border)] bg-transparent rounded-lg h-10 focus-visible:ring-2 focus-visible:ring-accent"
                                    required
                                />
                            </div>
                        </>
                    )}

                    <NwButton
                        type="submit"
                        disabled={isLoading}
                        data-testid="login-submit"
                        variant="accent"
                        className="w-full h-11 rounded-xl font-medium text-sm shadow-[0_0_20px_hsl(var(--accent)/0.40)] transition-[background-color,box-shadow] hover:shadow-[0_0_28px_hsl(var(--accent)/0.55)]"
                    >
                        {isLoading ? t('login.submit.loading') : isHosted ? t('login.submit.hosted') : t('login.submit.selfhost')}
                    </NwButton>

                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-1 text-xs text-muted-foreground">
                        <Link to="/terms" className="transition-colors hover:text-foreground">{t('footer.link.terms')}</Link>
                        <Link to="/privacy" className="transition-colors hover:text-foreground">{t('footer.link.privacy')}</Link>
                        <Link to="/copyright" className="transition-colors hover:text-foreground">{t('footer.link.copyright')}</Link>
                    </div>
                </form>
            </div>
            <ConfirmDialog {...dialogProps} />
        </div>
    )
}
