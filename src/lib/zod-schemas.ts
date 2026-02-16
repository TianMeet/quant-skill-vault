import { z } from 'zod/v4'

export const guardrailsSchema = z.object({
  allowed_tools: z.array(z.string()).default([]),
  disable_model_invocation: z.boolean().default(false),
  user_invocable: z.boolean().default(true),
  stop_conditions: z.array(z.string()).min(1, 'At least 1 stop condition required'),
  escalation: z.enum(['REVIEW', 'BLOCK', 'ASK_HUMAN']),
})

export const testCaseSchema = z.object({
  name: z.string().min(1),
  input: z.string().min(1),
  expected_output: z.string().min(1),
})

export const createSkillSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  summary: z.string().min(1, 'Summary is required'),
  inputs: z.string().default(''),
  outputs: z.string().default(''),
  steps: z.array(z.string()).min(3, 'At least 3 steps').max(7, 'At most 7 steps'),
  risks: z.string().default(''),
  triggers: z.array(z.string()).min(3, 'At least 3 triggers'),
  guardrails: guardrailsSchema,
  tests: z.array(testCaseSchema).min(1, 'At least 1 test case'),
  tags: z.array(z.string()).default([]),
})

export const updateSkillSchema = createSkillSchema.partial()

export type CreateSkillInput = z.infer<typeof createSkillSchema>
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>
