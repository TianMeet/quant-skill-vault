import { test, expect } from '@playwright/test'

const E2E_TAG_NAME = 'e2e-nav-load'

test.describe('Header navigation first-load behavior', () => {
  const createdSkillIds: number[] = []
  const createdDraftKeys: string[] = []

  test.afterEach(async ({ request }) => {
    for (const key of createdDraftKeys.splice(0)) {
      await request.delete(`/api/skill-drafts/${encodeURIComponent(key)}`)
    }
    for (const id of createdSkillIds.splice(0)) {
      await request.delete(`/api/skills/${id}`)
    }
  })

  test('header tabs load data on first visit without manual refresh', async ({ page, request }) => {
    const uniqueSuffix = Date.now().toString(36)
    const skillTitle = `E2E Nav Load ${uniqueSuffix}`
    const draftKey = `new:new:e2e-nav-load-${uniqueSuffix}`

    const createSkillRes = await request.post('/api/skills', {
      data: {
        title: skillTitle,
        summary: 'verify header tab first-load behavior',
        inputs: 'input',
        outputs: 'output',
        steps: ['collect data', 'analyze result', 'return response'],
        risks: '',
        triggers: ['header tab load', 'first visit data', 'no refresh needed'],
        guardrails: {
          allowed_tools: [],
          disable_model_invocation: false,
          user_invocable: true,
          stop_conditions: ['stop when request is invalid'],
          escalation: 'ASK_HUMAN',
        },
        tests: [{ name: 'basic', input: 'ping', expected_output: 'pong' }],
        tags: [E2E_TAG_NAME],
      },
    })
    expect(createSkillRes.ok()).toBeTruthy()
    const createdSkill = await createSkillRes.json()
    const createdSkillId = Number(createdSkill?.id)
    expect(createdSkillId).toBeGreaterThan(0)
    createdSkillIds.push(createdSkillId)

    const createDraftRes = await request.put(`/api/skill-drafts/${encodeURIComponent(draftKey)}`, {
      data: {
        mode: 'new',
        payload: {
          title: `draft-${uniqueSuffix}`,
          summary: 'draft used by nav test',
          activeTab: 'author',
        },
      },
    })
    expect(createDraftRes.ok()).toBeTruthy()
    createdDraftKeys.push(draftKey)

    await page.goto('/skills')
    await expect(page).toHaveURL(/\/skills(?:\?.*)?$/)

    await page.getByRole('link', { name: '标签管理' }).click()
    await expect(page).toHaveURL(/\/tags(?:\?.*)?$/)
    await expect(page.getByText(E2E_TAG_NAME)).toBeVisible({ timeout: 10000 })

    await page.getByRole('link', { name: '草稿管理' }).click()
    await expect(page).toHaveURL(/\/drafts(?:\?.*)?$/)
    await expect(page.getByText(draftKey)).toBeVisible({ timeout: 10000 })

    await page.getByRole('link', { name: '技能列表' }).click()
    await expect(page).toHaveURL(/\/skills(?:\?.*)?$/)
    await expect(page.getByText(skillTitle)).toBeVisible({ timeout: 10000 })
  })
})
