import type { ChatProviderAdapter, ChatProviderRequest, ChatStreamEvent } from './types'

const DEFAULT_STEPS = ['梳理输入目标', '执行核心流程', '输出可复用结果']
const DEFAULT_TRIGGERS = ['帮我生成 skill', '用对话创建技能', '帮我补全 skill 表单']

function pickLatestUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const item = messages[i] as { role?: unknown; content?: unknown }
    if (item?.role !== 'user') continue
    if (typeof item.content === 'string' && item.content.trim()) return item.content.trim()
    if (Array.isArray(item.content)) {
      const textItem = item.content.find((c) => (c as { type?: string }).type === 'text') as { text?: unknown } | undefined
      if (typeof textItem?.text === 'string' && textItem.text.trim()) return textItem.text.trim()
    }
  }
  return '创建一个新的 Skill'
}

function buildDraftSeed(latestText: string) {
  const seed = latestText.slice(0, 24)
  const title = seed.length > 0 ? `${seed} Skill` : '对话生成 Skill'
  return {
    title,
    summary: `用于${latestText}的对话式 Skill 模板。`,
    inputs: '用户需求描述',
    outputs: '结构化 Skill 草稿',
    steps: DEFAULT_STEPS,
    triggers: DEFAULT_TRIGGERS,
    guardrails: {
      allowed_tools: [],
      disable_model_invocation: false,
      user_invocable: true,
      stop_conditions: ['信息不足时停止并追问'],
      escalation: 'ASK_HUMAN',
    },
    tests: [
      {
        name: '基础创建',
        input: latestText,
        expected_output: '返回包含标题、步骤、触发词和测试的 Skill 草稿',
      },
    ],
    tags: ['chat', 'mock'],
  }
}

export class MockChatProvider implements ChatProviderAdapter {
  async *stream(req: ChatProviderRequest): AsyncGenerator<ChatStreamEvent> {
    if (process.env.CHAT_MOCK_SCENARIO === 'error') {
      throw new Error('Mock provider forced error')
    }

    const latestText = pickLatestUserText(req.messages)
    const draft = buildDraftSeed(latestText)

    yield {
      type: 'text_delta',
      text: '我会通过对话逐步填写表单，并实时回填到左侧字段。',
    }

    yield {
      type: 'tool_use',
      id: 'mock_tool_update_1',
      name: 'update_skill_draft',
      input: draft,
    }

    yield {
      type: 'text_delta',
      text: '已为你填充标题、摘要、步骤、触发词、护栏和测试用例。',
    }

    yield { type: 'done' }
  }
}
