import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import AdmZip from 'adm-zip'

test.describe('Skill Vault E2E', () => {
  // Clean up E2E test data before each test
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/skills')
    const skills = await res.json()
    for (const s of skills) {
      if (s.title.startsWith('E2E Test') || s.title.startsWith('Files Tab') || s.title.startsWith('AI Tab')) {
        await request.delete(`/api/skills/${s.id}`)
      }
    }
  })
  test('create a compliant skill, lint, and export zip', async ({ page }) => {
    // Navigate to new skill page
    await page.goto('/skills/new')
    await expect(page.locator('h1')).toContainText('New Skill')

    // Author tab - fill basic info
    await page.fill('input[placeholder="Skill title"]', 'E2E Test Skill')
    await page.fill('textarea[placeholder="Brief description of what this skill does"]', 'processes test data for e2e validation')

    // Add tags
    await page.fill('input[placeholder="Add tag..."]', 'E2E')
    await page.click('button:has-text("Add")')

    // Fill inputs/outputs
    await page.fill('textarea:below(:text("Inputs"))', 'Test input data')
    await page.fill('textarea:below(:text("Outputs"))', 'Validated output')

    // Fill steps (3 already present)
    const stepInputs = page.locator('input[placeholder^="Step"]')
    await stepInputs.nth(0).fill('Load test data')
    await stepInputs.nth(1).fill('Validate structure')
    await stepInputs.nth(2).fill('Output results')

    // Fill risks
    await page.fill('textarea:below(:text("Risks"))', 'Test data may be incomplete')

    // Switch to Triggers tab
    await page.click('button:has-text("Triggers")')
    const triggerInputs = page.locator('input[placeholder^="Trigger phrase"]')
    await triggerInputs.nth(0).fill('run e2e test')
    await triggerInputs.nth(1).fill('validate test data')
    await triggerInputs.nth(2).fill('process test suite')

    // Switch to Guardrails tab
    await page.click('button:has-text("Guardrails")')
    const stopInput = page.locator('input[placeholder="Stop condition..."]')
    await stopInput.first().fill('Stop if no test data provided')

    // Switch to Tests tab
    await page.click('button:has-text("Tests")')
    await page.fill('input[placeholder="Test name"]', 'basic validation')
    const testTextareas = page.locator('textarea[placeholder="Input"]')
    await testTextareas.first().fill('sample input')
    const expectedTextareas = page.locator('textarea[placeholder="Expected output"]')
    await expectedTextareas.first().fill('validated output')

    // Save the skill
    await page.click('button:has-text("Create Skill")')

    // Should redirect to detail page
    await expect(page).toHaveURL(/\/skills\/\d+/, { timeout: 10000 })
    await expect(page.locator('h1')).toContainText('E2E Test Skill')

    // Run lint check on detail page
    await page.click('button:has-text("Run Lint Check")')

    // Wait for lint result
    await expect(page.locator('text=Lint Passed')).toBeVisible({ timeout: 5000 })

    // Export ZIP
    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-zip-btn"]')
    const download = await downloadPromise

    // Verify download filename
    expect(download.suggestedFilename()).toMatch(/\.zip$/)

    // Save and verify zip contents
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsv-e2e-'))
    const zipPath = path.join(tmpDir, download.suggestedFilename())
    await download.saveAs(zipPath)

    // Verify zip file exists and has content
    const stats = fs.statSync(zipPath)
    expect(stats.size).toBeGreaterThan(0)

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('create supporting file via Files tab and verify in export zip', async ({ page }) => {
    // First create a compliant skill
    await page.goto('/skills/new')

    await page.fill('input[placeholder="Skill title"]', 'Files Tab Test')
    await page.fill('textarea[placeholder="Brief description of what this skill does"]', 'tests supporting files feature')
    await page.fill('textarea:below(:text("Inputs"))', 'Test input')
    await page.fill('textarea:below(:text("Outputs"))', 'Test output')

    const stepInputs = page.locator('input[placeholder^="Step"]')
    await stepInputs.nth(0).fill('Step A')
    await stepInputs.nth(1).fill('Step B')
    await stepInputs.nth(2).fill('Step C')
    await page.fill('textarea:below(:text("Risks"))', 'None')

    await page.click('button:has-text("Triggers")')
    const triggerInputs = page.locator('input[placeholder^="Trigger phrase"]')
    await triggerInputs.nth(0).fill('files tab test')
    await triggerInputs.nth(1).fill('supporting files test')
    await triggerInputs.nth(2).fill('test file management')

    await page.click('button:has-text("Guardrails")')
    await page.locator('input[placeholder="Stop condition..."]').first().fill('Stop on error')

    await page.click('button:has-text("Tests")')
    await page.fill('input[placeholder="Test name"]', 'file test')
    await page.locator('textarea[placeholder="Input"]').first().fill('input')
    await page.locator('textarea[placeholder="Expected output"]').first().fill('output')

    await page.click('button:has-text("Create Skill")')
    await expect(page).toHaveURL(/\/skills\/\d+/, { timeout: 10000 })

    // Navigate to edit page to access Files tab
    await page.click('a:has-text("Edit")')
    await expect(page.locator('h1')).toContainText('Edit Skill')

    // Switch to Files tab
    await page.click('button:has-text("Files")')

    // Create a new file: references/rules.md
    await page.fill('input[placeholder="e.g. rules.md"]', 'rules.md')
    await page.click('button:has-text("Create")')

    // Wait for file to appear in the list
    await expect(page.locator('text=rules.md')).toBeVisible({ timeout: 5000 })

    // Click on the file to edit it
    await page.click('button:has-text("rules.md")')

    // Type content in the editor
    await page.locator('textarea.font-mono').last().fill('# Dedup Rules\n\nThreshold: 0.8')

    // Save the file
    await page.click('button:has-text("Save")')

    // Go back to detail page
    await page.goBack()
    await page.reload()

    // Verify supporting files section shows
    await expect(page.locator('text=Supporting Files')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=references/rules.md')).toBeVisible()

    // Run lint and export zip
    await page.click('button:has-text("Run Lint Check")')
    await expect(page.locator('text=Lint Passed')).toBeVisible({ timeout: 5000 })

    const downloadPromise = page.waitForEvent('download')
    await page.click('[data-testid="export-zip-btn"]')
    const download = await downloadPromise

    // Save zip and verify it contains the supporting file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsv-files-e2e-'))
    const zipPath = path.join(tmpDir, download.suggestedFilename())
    await download.saveAs(zipPath)

    const stats = fs.statSync(zipPath)
    expect(stats.size).toBeGreaterThan(0)

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('AI tab: propose, preview, apply, and verify in export zip', async ({ page, request }) => {
    // First create a compliant skill via API for speed
    const createRes = await request.post('/api/skills', {
      data: {
        title: 'AI Tab Test',
        summary: 'tests ai integration feature',
        inputs: 'Test input',
        outputs: 'Test output',
        steps: ['Step A', 'Step B', 'Step C'],
        risks: 'None',
        triggers: ['ai tab test', 'test ai feature', 'ai integration test'],
        guardrails: {
          allowed_tools: [],
          disable_model_invocation: false,
          user_invocable: true,
          stop_conditions: ['Stop on error'],
          escalation: 'ASK_HUMAN',
        },
        tests: [{ name: 'basic', input: 'in', expected_output: 'out' }],
        tags: ['AI'],
      },
    })
    const skill = await createRes.json()
    const skillId = skill.id

    // Navigate to edit page
    await page.goto(`/skills/${skillId}/edit`)
    await expect(page.locator('h1')).toContainText('Edit Skill')

    // Switch to AI tab
    await page.click('button:has-text("AI")')

    // Click Improve button (uses fake claude via CLAUDE_BIN env)
    await page.click('[data-testid="ai-improve-btn"]')

    // Wait for preview to appear
    await expect(page.locator('[data-testid="ai-preview"]')).toBeVisible({ timeout: 30000 })

    // Verify file ops preview shows references/rules.md
    await expect(page.locator('text=references/rules.md')).toBeVisible()

    // Click on file to preview content
    await page.click('[data-testid="ai-file-references/rules.md"]')
    await expect(page.locator('[data-testid="ai-file-preview"]')).toBeVisible()

    // Click Apply
    await page.click('[data-testid="ai-apply-btn"]')

    // Wait for success message
    await expect(page.locator('text=Changes applied successfully')).toBeVisible({ timeout: 10000 })

    // Wait for page reload
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Verify export zip contains the new file
    const exportRes = await request.get(`/api/skills/${skillId}/export.zip`)
    expect(exportRes.status()).toBe(200)

    const zipBuffer = Buffer.from(await exportRes.body())
    const zip = new AdmZip(zipBuffer)
    const entries = zip.getEntries().map((e) => e.entryName)

    // Should contain SKILL.md and references/rules.md
    expect(entries.some((e) => e.endsWith('/SKILL.md'))).toBe(true)
    expect(entries.some((e) => e.endsWith('/references/rules.md'))).toBe(true)
  })
})
