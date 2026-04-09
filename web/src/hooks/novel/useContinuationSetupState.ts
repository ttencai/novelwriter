// SPDX-FileCopyrightText: 2026 Isaac.X.Ω.Yuan
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/services/api'
import { setStudioResultsStageSearchParams } from '@/components/novel-shell/NovelShellRouteState'

// ── Constants ──

type LengthOption = {
  label: string
  value: string
  disabled: boolean
}

export const LENGTH_OPTIONS: LengthOption[] = [
  { label: '2000', value: '2000', disabled: false },
  { label: '4000', value: '4000', disabled: false },
  { label: '6000', value: '6000', disabled: false },
]

const MIN_CONTEXT_CHAPTERS = 1
const DEFAULT_CONTEXT_CHAPTERS = 5

const DEMO_NOVEL_TITLE = '西游记'
const DEMO_DEFAULT_INSTRUCTION =
  '唐僧一行在松林中遇到一位自称观音座下的年轻僧人，言辞恳切，主动请缨护送西行。' +
  '八戒贪图省事，极力撺掇师父收留；沙僧不动声色，但注意到此人禅杖上刻有不属于佛门的纹路。' +
  '此人身份留白——可以是真心向佛的散修，也可以是某方势力安插的棋子。' +
  '本章以沙僧一个未说出口的疑虑收束。'

// ── Helpers ──

export function resolveTargetChars(selected: string): number {
  const opt = LENGTH_OPTIONS.find(o => o.value === selected)
  if (opt) return parseInt(opt.value, 10)
  const parsed = parseInt(selected, 10)
  if (!Number.isNaN(parsed) && parsed > 0) return parsed
  return 4000
}

function clampInt(raw: string, min: number, max: number): number | undefined {
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return undefined
  return Math.max(min, Math.min(max, n))
}

// ── Hook ──

/**
 * Shared continuation-setup form state.
 *
 * Hoisted at the page level so state survives stage-component mount/unmount
 * when the user switches between chapter and write stages.
 *
 * Keyed on `novelId` — a novel switch resets state naturally because the whole
 * `NovelStudioPage` remounts on `:novelId` change.
 */
export function useContinuationSetupState(novelId: number, chapterNum: number | null) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [instruction, setInstruction] = useState('')
  const [selectedLength, setSelectedLength] = useState('4000')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [contextChapters, setContextChapters] = useState(String(DEFAULT_CONTEXT_CHAPTERS))
  const [numVersions, setNumVersions] = useState('1')
  const [temperature, setTemperature] = useState('0.8')
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  // Load user preferences as defaults (once)
  useEffect(() => {
    if (prefsLoaded || !user?.preferences) return
    const p = user.preferences as Record<string, unknown>
    queueMicrotask(() => {
      if (p.num_versions != null) setNumVersions(String(p.num_versions))
      if (p.temperature != null) setTemperature(String(p.temperature))
      if (p.context_chapters != null) {
        const next = clampInt(String(p.context_chapters), MIN_CONTEXT_CHAPTERS, Number.MAX_SAFE_INTEGER)
        setContextChapters(String(next ?? DEFAULT_CONTEXT_CHAPTERS))
      }
      if (p.target_chars != null) {
        const tc = Number(p.target_chars)
        if (Number.isFinite(tc) && tc > 0) {
          const match = LENGTH_OPTIONS.find(o => Number(o.value) === tc)
          setSelectedLength(match ? match.value : String(Math.trunc(tc)))
        }
      }
      setPrefsLoaded(true)
    })
  }, [user?.preferences, prefsLoaded])

  // Demo novel pre-fill
  const demoDefaultApplied = useRef(false)
  useEffect(() => {
    if (!novelId || demoDefaultApplied.current) return
    let cancelled = false
    api.getNovel(novelId).then(n => {
      if (cancelled) return
      if (n.title === DEMO_NOVEL_TITLE) {
        demoDefaultApplied.current = true
        setInstruction(prev => prev || DEMO_DEFAULT_INSTRUCTION)
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [novelId])

  // Save preferences to server
  const savePrefs = useCallback(() => {
    const prefs: Record<string, unknown> = {}
    const nv = parseInt(numVersions, 10)
    if (!Number.isNaN(nv)) prefs.num_versions = Math.max(1, Math.min(2, nv))
    const temp = parseFloat(temperature)
    if (!Number.isNaN(temp)) prefs.temperature = Math.max(0, Math.min(2, temp))
    prefs.context_chapters = clampInt(contextChapters, MIN_CONTEXT_CHAPTERS, Number.MAX_SAFE_INTEGER) ?? DEFAULT_CONTEXT_CHAPTERS
    prefs.target_chars = resolveTargetChars(selectedLength)
    api.updatePreferences(prefs).catch(() => {})
  }, [numVersions, temperature, contextChapters, selectedLength])

  const handleGenerate = useCallback(() => {
    if (chapterNum === null) return
    const parsedTemp = parseFloat(temperature)
    const streamParams = {
      prompt: instruction.trim() || undefined,
      target_chars: resolveTargetChars(selectedLength),
      context_chapters: clampInt(contextChapters, MIN_CONTEXT_CHAPTERS, Number.MAX_SAFE_INTEGER) ?? DEFAULT_CONTEXT_CHAPTERS,
      num_versions: clampInt(numVersions, 1, 2) || undefined,
      temperature: !Number.isNaN(parsedTemp) ? Math.max(0, Math.min(2, parsedTemp)) : undefined,
    }
    savePrefs()
    const nextSearchParams = setStudioResultsStageSearchParams(new URLSearchParams(), chapterNum)
    navigate(`/novel/${novelId}?${nextSearchParams.toString()}`, {
      state: { streamParams, novelId },
    })
  }, [chapterNum, contextChapters, instruction, navigate, novelId, numVersions, savePrefs, selectedLength, temperature])

  return {
    instruction,
    setInstruction,
    selectedLength,
    setSelectedLength,
    advancedOpen,
    setAdvancedOpen,
    contextChapters,
    setContextChapters,
    numVersions,
    setNumVersions,
    temperature,
    setTemperature,
    handleGenerate,
  }
}
