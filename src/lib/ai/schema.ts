/**
 * ChangeSet JSON Schema - 用于 Claude CLI --json-schema 参数
 * 强制 Claude 输出符合此 schema 的 structured_output
 */
export const changeSetJsonSchema = JSON.stringify({
  type: 'object',
  required: ['skillPatch', 'fileOps'],
  additionalProperties: false,
  properties: {
    skillPatch: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        inputs: { type: 'string' },
        outputs: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 7 },
        risks: { type: 'string' },
        triggers: { type: 'array', items: { type: 'string' }, minItems: 3 },
        guardrails: {
          type: 'object',
          additionalProperties: false,
          properties: {
            allowed_tools: { type: 'array', items: { type: 'string' } },
            disable_model_invocation: { type: 'boolean' },
            user_invocable: { type: 'boolean' },
            stop_conditions: { type: 'array', items: { type: 'string' } },
            escalation: { type: 'string', enum: ['REVIEW', 'BLOCK', 'ASK_HUMAN'] },
          },
        },
        tests: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'input', 'expected_output'],
            properties: {
              name: { type: 'string' },
              input: { type: 'string' },
              expected_output: { type: 'string' },
            },
          },
        },
        tags: { type: 'array', items: { type: 'string' } },
      },
    },
    fileOps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['op', 'path'],
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: ['upsert', 'delete'] },
          path: { type: 'string' },
          mime: { type: 'string' },
          content_text: { type: 'string' },
          content_base64: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
})
