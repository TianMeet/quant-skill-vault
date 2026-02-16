/**
 * create_skill 工具定义
 * JSON Schema 严格对齐 createSkillSchema
 */

import type Anthropic from '@anthropic-ai/sdk'

export const CREATE_SKILL_TOOL: Anthropic.Tool = {
  name: 'create_skill',
  description:
    '当收集到足够的 Skill 信息后，调用此工具生成结构化的 Skill 数据。所有必填字段都必须提供。',
  input_schema: {
    type: 'object' as const,
    required: ['title', 'summary', 'steps', 'triggers', 'guardrails', 'tests'],
    properties: {
      title: {
        type: 'string',
        description: 'Skill 标题，不超过 200 字符',
        maxLength: 200,
      },
      summary: {
        type: 'string',
        description: 'Skill 的简要描述',
      },
      inputs: {
        type: 'string',
        description: 'Skill 需要的输入说明',
        default: '',
      },
      outputs: {
        type: 'string',
        description: 'Skill 的输出说明',
        default: '',
      },
      steps: {
        type: 'array',
        description: '3-7 个执行步骤，使用祈使语气',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 7,
      },
      risks: {
        type: 'string',
        description: '潜在风险说明',
        default: '',
      },
      triggers: {
        type: 'array',
        description: '至少 3 个触发短语',
        items: { type: 'string' },
        minItems: 3,
      },
      guardrails: {
        type: 'object',
        description: '安全护栏配置',
        required: ['stop_conditions', 'escalation'],
        properties: {
          allowed_tools: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
          disable_model_invocation: {
            type: 'boolean',
            default: false,
          },
          user_invocable: {
            type: 'boolean',
            default: true,
          },
          stop_conditions: {
            type: 'array',
            description: '至少 1 个停止条件',
            items: { type: 'string' },
            minItems: 1,
          },
          escalation: {
            type: 'string',
            enum: ['REVIEW', 'BLOCK', 'ASK_HUMAN'],
            description: '升级策略',
          },
        },
      },
      tests: {
        type: 'array',
        description: '至少 1 个测试用例',
        items: {
          type: 'object',
          required: ['name', 'input', 'expected_output'],
          properties: {
            name: { type: 'string' },
            input: { type: 'string' },
            expected_output: { type: 'string' },
          },
        },
        minItems: 1,
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        default: [],
      },
    },
  },
}
