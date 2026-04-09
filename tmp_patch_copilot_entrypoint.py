from pathlib import Path

files = {
    r'E:\AI_code\novelwriter\web\src\types\copilot.ts': None,
    r'E:\AI_code\novelwriter\web\src\hooks\novel-copilot\useNovelCopilotSessions.ts': None,
    r'E:\AI_code\novelwriter\web\src\components\novel-copilot\NovelCopilotProvider.tsx': None,
    r'E:\AI_code\novelwriter\web\src\components\novel-chat\NovelAssistantChatProvider.tsx': None,
    r'E:\AI_code\novelwriter\web\src\services\copilotApi.ts': None,
    r'E:\AI_code\novelwriter\app\schemas.py': None,
    r'E:\AI_code\novelwriter\app\api\copilot.py': None,
    r'E:\AI_code\novelwriter\app\core\copilot\__init__.py': None,
    r'E:\AI_code\novelwriter\tests\copilot\test_runtime.py': None,
    r'E:\AI_code\novelwriter\tests\copilot\test_e2e_llm.py': None,
    r'E:\AI_code\novelwriter\web\src\__tests__\NovelCopilotDrawer.test.tsx': None,
    r'E:\AI_code\novelwriter\web\src\__tests__\api.test.ts': None,
    r'E:\AI_code\novelwriter\web\src\__tests__\NovelShell.test.tsx': None,
    r'E:\AI_code\novelwriter\web\src\__tests__\NovelStudioPage.test.tsx': None,
}
for path in files:
    files[path] = Path(path).read_text(encoding='utf-8')

# web/src/types/copilot.ts
path = r'E:\AI_code\novelwriter\web\src\types\copilot.ts'
text = files[path]
text = text.replace(
    "export const DEFAULT_COPILOT_INTERACTION_LOCALE = DEFAULT_UI_LOCALE\n",
    "export const DEFAULT_COPILOT_INTERACTION_LOCALE = DEFAULT_UI_LOCALE\nexport type CopilotSessionEntrypoint = 'copilot_drawer' | 'assistant_chat'\n",
)
text = text.replace(
    "export interface NovelCopilotSession {\n  sessionId: string\n  signature: string\n",
    "export interface NovelCopilotSession {\n  sessionId: string\n  signature: string\n  entrypoint: CopilotSessionEntrypoint\n",
)
text = text.replace(
    "export interface OpenNovelCopilotOptions {\n  displayTitle?: string\n}\n",
    "export interface OpenNovelCopilotOptions {\n  displayTitle?: string\n}\n\nexport interface UseNovelCopilotSessionIdentityOptions {\n  entrypoint: CopilotSessionEntrypoint\n}\n",
)
text = text.replace(
    "export function buildCopilotSessionSignature(\n  prefill: CopilotPrefill,\n  novelId: number,\n  interactionLocale: string,\n) {\n",
    "export function buildCopilotSessionSignature(\n  prefill: CopilotPrefill,\n  novelId: number,\n  interactionLocale: string,\n  options: UseNovelCopilotSessionIdentityOptions,\n) {\n",
)
text = text.replace(
    '    novel_id: novelId,\n',
    "    novel_id: novelId,\n    entrypoint: options.entrypoint,\n",
    1,
)
Path(path).write_text(text, encoding='utf-8')

# web/src/hooks/novel-copilot/useNovelCopilotSessions.ts
path = r'E:\AI_code\novelwriter\web\src\hooks\novel-copilot\useNovelCopilotSessions.ts'
text = files[path]
text = text.replace(
    "  buildCopilotSessionSignature,\n  normalizeCopilotInteractionLocale,\n  type CopilotPrefill,\n  type OpenNovelCopilotOptions,\n  type NovelCopilotSession,\n} from '@/types/copilot'\n",
    "  buildCopilotSessionSignature,\n  normalizeCopilotInteractionLocale,\n  type CopilotPrefill,\n  type CopilotSessionEntrypoint,\n  type OpenNovelCopilotOptions,\n  type NovelCopilotSession,\n} from '@/types/copilot'\n",
)
text = text.replace(
    "function buildOpenSessionRequest(session: NovelCopilotSession) {\n  return {\n    mode: session.prefill.mode,\n    scope: session.prefill.scope,\n    context: session.prefill.context,\n    interaction_locale: session.interactionLocale,\n    display_title: session.displayTitle,\n  }\n}\n",
    "function buildOpenSessionRequest(session: NovelCopilotSession) {\n  return {\n    mode: session.prefill.mode,\n    scope: session.prefill.scope,\n    context: session.prefill.context,\n    interaction_locale: session.interactionLocale,\n    entrypoint: session.entrypoint,\n    display_title: session.displayTitle,\n  }\n}\n",
)
text = text.replace(
    "interface UseNovelCopilotSessionsStateParams {\n  novelId: number | null\n  interactionLocale: string\n}\n",
    "interface UseNovelCopilotSessionsStateParams {\n  novelId: number | null\n  interactionLocale: string\n  entrypoint: CopilotSessionEntrypoint\n}\n",
)
text = text.replace(
    "export function useNovelCopilotSessionsState({\n  novelId,\n  interactionLocale,\n}: UseNovelCopilotSessionsStateParams): NovelCopilotSessionsOnlyState {\n",
    "export function useNovelCopilotSessionsState({\n  novelId,\n  interactionLocale,\n  entrypoint,\n}: UseNovelCopilotSessionsStateParams): NovelCopilotSessionsOnlyState {\n",
)
text = text.replace(
    "    const signature = buildCopilotSessionSignature(prefill, novelId, normalizedInteractionLocale)\n",
    "    const signature = buildCopilotSessionSignature(prefill, novelId, normalizedInteractionLocale, { entrypoint })\n",
)
text = text.replace(
    "      interactionLocale: normalizedInteractionLocale,\n      backendSessionId: null,\n",
    "      interactionLocale: normalizedInteractionLocale,\n      entrypoint,\n      backendSessionId: null,\n",
)
Path(path).write_text(text, encoding='utf-8')

# NovelCopilotProvider
path = r'E:\AI_code\novelwriter\web\src\components\novel-copilot\NovelCopilotProvider.tsx'
text = files[path]
text = text.replace(
    "  const sessionsState = useNovelCopilotSessionsState({\n    novelId,\n    interactionLocale: effectiveInteractionLocale,\n  })\n",
    "  const sessionsState = useNovelCopilotSessionsState({\n    novelId,\n    interactionLocale: effectiveInteractionLocale,\n    entrypoint: 'copilot_drawer',\n  })\n",
)
Path(path).write_text(text, encoding='utf-8')

# NovelAssistantChatProvider
path = r'E:\AI_code\novelwriter\web\src\components\novel-chat\NovelAssistantChatProvider.tsx'
text = files[path]
text = text.replace(
    "  const sessionsState = useNovelCopilotSessionsState({\n    novelId,\n    interactionLocale: effectiveInteractionLocale,\n  })\n",
    "  const sessionsState = useNovelCopilotSessionsState({\n    novelId,\n    interactionLocale: effectiveInteractionLocale,\n    entrypoint: 'assistant_chat',\n  })\n",
)
Path(path).write_text(text, encoding='utf-8')

# web/src/services/copilotApi.ts
path = r'E:\AI_code\novelwriter\web\src\services\copilotApi.ts'
text = files[path]
text = text.replace(
    "  CopilotEvidence,\n  CopilotFieldDelta,\n",
    "  CopilotEvidence,\n  CopilotFieldDelta,\n  CopilotSessionEntrypoint,\n",
)
text = text.replace(
    "export interface CopilotSessionOpenRequest {\n  mode: CopilotMode\n  scope: CopilotScope\n",
    "export interface CopilotSessionOpenRequest {\n  mode: CopilotMode\n  scope: CopilotScope\n  entrypoint?: CopilotSessionEntrypoint\n",
)
Path(path).write_text(text, encoding='utf-8')

# app/schemas.py
path = r'E:\AI_code\novelwriter\app\schemas.py'
text = files[path]
text = text.replace(
    'CopilotContextStage = Literal["chapter", "write", "results", "entity", "relationship", "system", "review"]\n',
    'CopilotContextStage = Literal["chapter", "write", "results", "entity", "relationship", "system", "review"]\nCopilotSessionEntrypoint = Literal["copilot_drawer", "assistant_chat"]\n',
)
text = text.replace(
    "class CopilotSessionOpenRequest(BaseModel):\n    mode: CopilotMode\n    scope: CopilotScope\n    context: Optional[CopilotContextData] = None\n    interaction_locale: str = Field(default=\"zh\", max_length=10)\n    display_title: str = Field(default=\"\", max_length=255)\n",
    "class CopilotSessionOpenRequest(BaseModel):\n    mode: CopilotMode\n    scope: CopilotScope\n    context: Optional[CopilotContextData] = None\n    interaction_locale: str = Field(default=\"zh\", max_length=10)\n    entrypoint: CopilotSessionEntrypoint = \"copilot_drawer\"\n    display_title: str = Field(default=\"\", max_length=255)\n",
)
Path(path).write_text(text, encoding='utf-8')

# app/api/copilot.py
path = r'E:\AI_code\novelwriter\app\api\copilot.py'
text = files[path]
text = text.replace(
    "            context=context,\n            interaction_locale=body.interaction_locale,\n            display_title=body.display_title,\n",
    "            context=context,\n            interaction_locale=body.interaction_locale,\n            entrypoint=body.entrypoint,\n            display_title=body.display_title,\n",
)
Path(path).write_text(text, encoding='utf-8')

# app/core/copilot/__init__.py
path = r'E:\AI_code\novelwriter\app\core\copilot\__init__.py'
text = files[path]
text = text.replace(
    "def build_session_signature(\n    mode: str,\n    scope: str,\n    context: dict | None,\n    interaction_locale: str,\n) -> str:\n",
    "def build_session_signature(\n    mode: str,\n    scope: str,\n    context: dict | None,\n    interaction_locale: str,\n    entrypoint: str,\n) -> str:\n",
)
text = text.replace(
    '            "locale": normalized_interaction_locale,\n',
    '            "locale": normalized_interaction_locale,\n            "entrypoint": entrypoint,\n',
    1,
)
text = text.replace(
    "def open_or_reuse_session(\n    db: Session,\n    novel_id: int,\n    user_id: int,\n    mode: str,\n    scope: str,\n    context: dict | None,\n    interaction_locale: str,\n    display_title: str,\n) -> tuple[CopilotSession, bool]:\n",
    "def open_or_reuse_session(\n    db: Session,\n    novel_id: int,\n    user_id: int,\n    mode: str,\n    scope: str,\n    context: dict | None,\n    interaction_locale: str,\n    entrypoint: str,\n    display_title: str,\n) -> tuple[CopilotSession, bool]:\n",
)
text = text.replace(
    "    sig = build_session_signature(mode, scope, context, normalized_interaction_locale)\n",
    "    sig = build_session_signature(mode, scope, context, normalized_interaction_locale, entrypoint)\n",
)
Path(path).write_text(text, encoding='utf-8')

# tests/copilot/test_runtime.py
path = r'E:\AI_code\novelwriter\tests\copilot\test_runtime.py'
text = files[path]
text = text.replace(', "zh", ""', ', "zh", "copilot_drawer", ""')
text = text.replace(', "en", ""', ', "en", "copilot_drawer", ""')
text = text.replace(', locale, ""', ', locale, "copilot_drawer", ""')
text = text.replace(', "zh", "初始标题"', ', "zh", "copilot_drawer", "初始标题"')
text = text.replace(', "zh", "更新标题"', ', "zh", "copilot_drawer", "更新标题"')
text = text.replace(', "en-US", "English workspace"', ', "en-US", "copilot_drawer", "English workspace"')
text = text.replace(', "en", "English workspace 2"', ', "en", "copilot_drawer", "English workspace 2"')
text = text.replace(', "zh", "g1"', ', "zh", "copilot_drawer", "g1"')
text = text.replace(', "zh", "g2"', ', "zh", "copilot_drawer", "g2"')
anchor = '''    def test_whole_book_ui_context_does_not_split_session(self, client, novel):
        r1 = client.post(
            f"/api/novels/{novel.id}/world/copilot/sessions",
            json={
                "mode": "research",
                "scope": "whole_book",
                "context": {"surface": "studio", "stage": "write"},
            },
        ).json()
        r2 = client.post(
            f"/api/novels/{novel.id}/world/copilot/sessions",
            json={
                "mode": "research",
                "scope": "whole_book",
                "context": {"surface": "atlas", "stage": "systems", "tab": "systems"},
            },
        ).json()
        assert r1["session_id"] == r2["session_id"]
        assert r2["context"]["surface"] == "atlas"
        assert r2["context"]["tab"] == "systems"
        assert r2["context"]["stage"] is None
'''
replacement = anchor + '''
    def test_entrypoint_splits_session_identity_for_same_whole_book_context(self, client, novel):
        drawer = client.post(
            f"/api/novels/{novel.id}/world/copilot/sessions",
            json={
                "mode": "research",
                "scope": "whole_book",
                "entrypoint": "copilot_drawer",
            },
        ).json()
        chat = client.post(
            f"/api/novels/{novel.id}/world/copilot/sessions",
            json={
                "mode": "research",
                "scope": "whole_book",
                "entrypoint": "assistant_chat",
            },
        ).json()
        assert drawer["session_id"] != chat["session_id"]

    def test_service_boundary_reuses_same_entrypoint_but_splits_different_entrypoints(self, db, novel):
        from app.core.copilot import open_or_reuse_session

        drawer, created = open_or_reuse_session(
            db, novel.id, 1, "research", "whole_book", None, "zh", "copilot_drawer", "Drawer"
        )
        assert created is True

        drawer_reused, created = open_or_reuse_session(
            db, novel.id, 1, "research", "whole_book", None, "zh", "copilot_drawer", "Drawer 2"
        )
        assert created is False
        assert drawer_reused.session_id == drawer.session_id

        chat, created = open_or_reuse_session(
            db, novel.id, 1, "research", "whole_book", None, "zh", "assistant_chat", "Chat"
        )
        assert created is True
        assert chat.session_id != drawer.session_id
'''
text = text.replace(anchor, replacement)
Path(path).write_text(text, encoding='utf-8')

# tests/copilot/test_e2e_llm.py
path = r'E:\AI_code\novelwriter\tests\copilot\test_e2e_llm.py'
text = files[path]
text = text.replace(
    'session, _ = open_or_reuse_session(db, novel.id, 1, mode, scope, context, locale, "")',
    'session, _ = open_or_reuse_session(db, novel.id, 1, mode, scope, context, locale, "copilot_drawer", "")',
)
Path(path).write_text(text, encoding='utf-8')

# NovelCopilotDrawer.test.tsx
path = r'E:\AI_code\novelwriter\web\src\__tests__\NovelCopilotDrawer.test.tsx'
text = files[path]
text = text.replace(
    "          mode: 'current_entity',\n          scope: 'current_entity',\n          context: { entity_id: 101 },\n",
    "          mode: 'current_entity',\n          scope: 'current_entity',\n          entrypoint: 'copilot_drawer',\n          context: { entity_id: 101 },\n",
)
marker = "  it('reuses the same current-entity session across studio and atlas UI contexts', async () => {"
inserted = "  it('keeps drawer sessions isolated from assistant-chat entrypoints at the API boundary', async () => {\n    const user = userEvent.setup()\n    render(createElement(DrawerHarness))\n\n    await user.click(screen.getByRole('button', { name: 'open-whole-book' }))\n\n    await waitFor(() => {\n      expect(mockOpenSession).toHaveBeenCalledWith(\n        1,\n        expect.objectContaining({\n          mode: 'research',\n          scope: 'whole_book',\n          entrypoint: 'copilot_drawer',\n        }),\n      )\n    })\n  })\n\n" + marker
text = text.replace(marker, inserted)
Path(path).write_text(text, encoding='utf-8')

# api.test.ts
path = r'E:\AI_code\novelwriter\web\src\__tests__\api.test.ts'
text = files[path]
old = '''    const result = await copilotApi.openSession(1, {
      mode: 'current_entity',
      scope: 'current_entity',
      context: { entity_id: 101, surface: 'atlas', tab: 'entities' },
    })

    expect(result.context).toEqual({
'''
new = '''    const result = await copilotApi.openSession(1, {
      mode: 'current_entity',
      scope: 'current_entity',
      entrypoint: 'copilot_drawer',
      context: { entity_id: 101, surface: 'atlas', tab: 'entities' },
    })

    const init = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls[0][1]
    expect(init.body).toBe(JSON.stringify({
      mode: 'current_entity',
      scope: 'current_entity',
      entrypoint: 'copilot_drawer',
      context: { entity_id: 101, surface: 'atlas', tab: 'entities' },
    }))

    expect(result.context).toEqual({
'''
text = text.replace(old, new)
Path(path).write_text(text, encoding='utf-8')

# NovelShell.test.tsx
path = r'E:\AI_code\novelwriter\web\src\__tests__\NovelShell.test.tsx'
text = files[path]
text = text.replace(
    "import { NovelShell } from '@/components/novel-shell/NovelShell'\n",
    "import { NovelShell } from '@/components/novel-shell/NovelShell'\nimport { copilotApi } from '@/services/api'\n",
)
text = text.replace(
    "const mockUseWorldEntities = vi.fn()\n",
    "const mockOpenSession = copilotApi.openSession as ReturnType<typeof vi.fn>\n\nconst mockUseWorldEntities = vi.fn()\n",
)
text = text.replace(
    "    await user.click(screen.getByRole('button', { name: '打开工作台' }))\n    await user.click(screen.getByRole('button', { name: '调整宽度' }))\n",
    "    await user.click(screen.getByRole('button', { name: '打开工作台' }))\n    await waitFor(() => {\n      expect(mockOpenSession).toHaveBeenCalledWith(\n        7,\n        expect.objectContaining({ entrypoint: 'copilot_drawer' }),\n      )\n    })\n    await user.click(screen.getByRole('button', { name: '调整宽度' }))\n",
    1,
)
Path(path).write_text(text, encoding='utf-8')

# NovelStudioPage.test.tsx
path = r'E:\AI_code\novelwriter\web\src\__tests__\NovelStudioPage.test.tsx'
text = files[path]
text = text.replace(
    "    openSession: vi.fn().mockResolvedValue({ session_id: 'copilot-session-1' }),\n",
    "    openSession: vi.fn().mockResolvedValue({ session_id: 'copilot-session-1', signature: 'sig-1', mode: 'research', scope: 'whole_book', context: null, interaction_locale: 'zh', display_title: '', created: true, created_at: new Date().toISOString() }),\n",
)
Path(path).write_text(text, encoding='utf-8')

print('patched')
