import { create } from 'zustand'
import type { SkillGuardrails, SkillTestCase, SkillData } from '@/lib/types'
import type { SkillDraft } from '@/lib/chat/types'

const defaultGuardrails: SkillGuardrails = {
  allowed_tools: [],
  disable_model_invocation: false,
  user_invocable: true,
  stop_conditions: [''],
  escalation: 'ASK_HUMAN',
}

const defaultTest: SkillTestCase = { name: '', input: '', expected_output: '' }

/** 模块级 timer map，不放进 store state */
const aiHighlightTimers = new Map<string, NodeJS.Timeout>()

export interface SkillStoreState {
  // 表单字段
  title: string
  summary: string
  inputs: string
  outputs: string
  steps: string[]
  risks: string
  triggers: string[]
  guardrails: SkillGuardrails
  tests: SkillTestCase[]
  tags: string[]

  // UI 状态
  activeTab: string
  saving: boolean
  error: string
  lintErrors: Array<{ field: string; message: string }>
  lintPassed: boolean

  // AI 追踪
  activeField: string | null
  userEdited: Set<string>
  aiFilledFields: Set<string>

  // Actions — 通用
  setField: <K extends keyof SkillFormFields>(key: K, value: SkillFormFields[K]) => void
  setUIField: <K extends keyof SkillUIFields>(key: K, value: SkillUIFields[K]) => void
  markUserEdited: (field: string) => void
  setActiveField: (field: string | null) => void
  highlightField: (field: string) => void

  // Actions — AI draft
  applyDraft: (draft: SkillDraft) => void
  initFromData: (data: SkillData & { tags?: string[] }) => void
  reset: () => void

  // Actions — 数组操作
  addStep: () => void
  removeStep: (i: number) => void
  updateStep: (i: number, v: string) => void
  addTrigger: () => void
  removeTrigger: (i: number) => void
  updateTrigger: (i: number, v: string) => void
  addTest: () => void
  removeTest: (i: number) => void
  updateTest: (i: number, field: keyof SkillTestCase, v: string) => void
  addStopCondition: () => void
  removeStopCondition: (i: number) => void
  updateStopCondition: (i: number, v: string) => void
  addTag: (tag: string) => void
  removeTag: (tag: string) => void
  addAllowedTool: (tool: string) => void
  removeAllowedTool: (tool: string) => void
  setGuardrails: (g: SkillGuardrails) => void
}

/** 表单字段子集 */
type SkillFormFields = {
  title: string
  summary: string
  inputs: string
  outputs: string
  steps: string[]
  risks: string
  triggers: string[]
  guardrails: SkillGuardrails
  tests: SkillTestCase[]
  tags: string[]
}

/** UI 状态子集 */
type SkillUIFields = {
  activeTab: string
  saving: boolean
  error: string
  lintErrors: Array<{ field: string; message: string }>
  lintPassed: boolean
}

const initialFormState: SkillFormFields = {
  title: '',
  summary: '',
  inputs: '',
  outputs: '',
  steps: ['', '', ''],
  risks: '',
  triggers: ['', '', ''],
  guardrails: { ...defaultGuardrails },
  tests: [{ ...defaultTest }],
  tags: [],
}

export const useSkillStore = create<SkillStoreState>((set, get) => ({
  // 初始表单字段
  ...initialFormState,

  // 初始 UI 状态
  activeTab: 'author',
  saving: false,
  error: '',
  lintErrors: [],
  lintPassed: false,

  // 初始 AI 追踪
  activeField: null,
  userEdited: new Set<string>(),
  aiFilledFields: new Set<string>(),

  // --- Actions ---

  setField: (key, value) => set({ [key]: value }),

  setUIField: (key, value) => set({ [key]: value }),

  markUserEdited: (field) =>
    set((state) => {
      const next = new Set(state.userEdited)
      next.add(field)
      return { userEdited: next }
    }),

  setActiveField: (field) => set({ activeField: field }),

  highlightField: (field) =>
    set((state) => {
      const next = new Set(state.aiFilledFields)
      next.add(field)

      // 清除之前的计时器
      const existing = aiHighlightTimers.get(field)
      if (existing) clearTimeout(existing)

      // 3 秒后移除高亮
      const timer = setTimeout(() => {
        const store = useSkillStore.getState()
        const updated = new Set(store.aiFilledFields)
        updated.delete(field)
        useSkillStore.setState({ aiFilledFields: updated })
        aiHighlightTimers.delete(field)
      }, 3000)
      aiHighlightTimers.set(field, timer)

      return { aiFilledFields: next }
    }),

  applyDraft: (draft) => {
    const state = get()
    const updates: Partial<SkillStoreState> = {}

    const simpleFields = ['title', 'summary', 'inputs', 'outputs', 'risks'] as const
    for (const key of simpleFields) {
      if (draft[key] !== undefined && !state.userEdited.has(key)) {
        ;(updates as Record<string, unknown>)[key] = draft[key]
        state.highlightField(key)
      }
    }

    if (draft.steps !== undefined && !state.userEdited.has('steps')) {
      updates.steps = draft.steps.length > 0 ? draft.steps : ['', '', '']
      state.highlightField('steps')
    }

    if (draft.triggers !== undefined && !state.userEdited.has('triggers')) {
      updates.triggers = draft.triggers.length > 0 ? draft.triggers : ['', '', '']
      state.highlightField('triggers')
    }

    if (draft.tags !== undefined && !state.userEdited.has('tags')) {
      updates.tags = draft.tags
      state.highlightField('tags')
    }

    if (draft.tests !== undefined && !state.userEdited.has('tests')) {
      const mapped = draft.tests.map((t) => ({
        name: t.name || '',
        input: t.input || '',
        expected_output: t.expected_output || '',
      }))
      updates.tests = mapped.length > 0 ? mapped : [{ ...defaultTest }]
      state.highlightField('tests')
    }

    if (draft.guardrails !== undefined && !state.userEdited.has('guardrails')) {
      const g = state.guardrails
      updates.guardrails = {
        ...g,
        ...draft.guardrails,
        allowed_tools: draft.guardrails.allowed_tools ?? g.allowed_tools,
        stop_conditions: draft.guardrails.stop_conditions ?? g.stop_conditions,
        escalation: draft.guardrails.escalation ?? g.escalation,
        disable_model_invocation: draft.guardrails.disable_model_invocation ?? g.disable_model_invocation,
        user_invocable: draft.guardrails.user_invocable ?? g.user_invocable,
      }
      state.highlightField('guardrails')
    }

    if (Object.keys(updates).length > 0) {
      const ftMap: Record<string, number> = {
        title: 0, summary: 0, inputs: 0, outputs: 0, steps: 0, risks: 0, tags: 0,
        triggers: 1, guardrails: 2, tests: 3,
      }
      const tabs = ['author', 'triggers', 'guardrails', 'tests']
      let maxP = -1
      for (const key of Object.keys(updates)) {
        const p = ftMap[key] ?? -1
        if (p > maxP) maxP = p
      }
      if (maxP >= 0) (updates as Record<string, unknown>).activeTab = tabs[maxP]
      set(updates)
    }
  },

  initFromData: (data) =>
    set({
      title: data.title || '',
      summary: data.summary || '',
      inputs: data.inputs || '',
      outputs: data.outputs || '',
      steps: data.steps?.length ? data.steps : ['', '', ''],
      risks: data.risks || '',
      triggers: data.triggers?.length ? data.triggers : ['', '', ''],
      guardrails: data.guardrails || { ...defaultGuardrails },
      tests: data.tests?.length ? data.tests : [{ ...defaultTest }],
      tags: data.tags || [],
    }),

  reset: () => {
    // 清除所有高亮 timer
    for (const timer of aiHighlightTimers.values()) clearTimeout(timer)
    aiHighlightTimers.clear()
    set({
      ...initialFormState,
      guardrails: { ...defaultGuardrails },
      tests: [{ ...defaultTest }],
      activeTab: 'author',
      saving: false,
      error: '',
      lintErrors: [],
      lintPassed: false,
      activeField: null,
      userEdited: new Set<string>(),
      aiFilledFields: new Set<string>(),
    })
  },

  // --- 数组操作 ---

  addStep: () =>
    set((s) => (s.steps.length < 7 ? { steps: [...s.steps, ''] } : {})),

  removeStep: (i) =>
    set((s) => (s.steps.length > 3 ? { steps: s.steps.filter((_, idx) => idx !== i) } : {})),

  updateStep: (i, v) =>
    set((s) => {
      const steps = [...s.steps]
      steps[i] = v
      return { steps }
    }),

  addTrigger: () =>
    set((s) => ({ triggers: [...s.triggers, ''] })),

  removeTrigger: (i) =>
    set((s) => (s.triggers.length > 3 ? { triggers: s.triggers.filter((_, idx) => idx !== i) } : {})),

  updateTrigger: (i, v) =>
    set((s) => {
      const triggers = [...s.triggers]
      triggers[i] = v
      return { triggers }
    }),

  addTest: () =>
    set((s) => ({ tests: [...s.tests, { ...defaultTest }] })),

  removeTest: (i) =>
    set((s) => (s.tests.length > 1 ? { tests: s.tests.filter((_, idx) => idx !== i) } : {})),

  updateTest: (i, field, v) =>
    set((s) => {
      const tests = [...s.tests]
      tests[i] = { ...tests[i], [field]: v }
      return { tests }
    }),

  addStopCondition: () =>
    set((s) => ({
      guardrails: { ...s.guardrails, stop_conditions: [...s.guardrails.stop_conditions, ''] },
    })),

  removeStopCondition: (i) =>
    set((s) =>
      s.guardrails.stop_conditions.length > 1
        ? { guardrails: { ...s.guardrails, stop_conditions: s.guardrails.stop_conditions.filter((_, idx) => idx !== i) } }
        : {},
    ),

  updateStopCondition: (i, v) =>
    set((s) => {
      const sc = [...s.guardrails.stop_conditions]
      sc[i] = v
      return { guardrails: { ...s.guardrails, stop_conditions: sc } }
    }),

  addTag: (tag) =>
    set((s) => (tag && !s.tags.includes(tag) ? { tags: [...s.tags, tag] } : {})),

  removeTag: (tag) =>
    set((s) => ({ tags: s.tags.filter((t) => t !== tag) })),

  addAllowedTool: (tool) =>
    set((s) =>
      tool && !s.guardrails.allowed_tools.includes(tool)
        ? { guardrails: { ...s.guardrails, allowed_tools: [...s.guardrails.allowed_tools, tool] } }
        : {},
    ),

  removeAllowedTool: (tool) =>
    set((s) => ({
      guardrails: { ...s.guardrails, allowed_tools: s.guardrails.allowed_tools.filter((t) => t !== tool) },
    })),

  setGuardrails: (g) => set({ guardrails: g }),
}))
