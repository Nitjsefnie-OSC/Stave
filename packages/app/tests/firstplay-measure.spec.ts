import fs from 'node:fs'
import { test, expect, type Page } from '@playwright/test'

/**
 * Probe instrument for #2032: how long the FIRST Ctrl+Enter on a fresh page
 * takes to report playing. Measurement only — it asserts the transport reaches
 * "playing" and records the wait; it passes wherever the app plays at all.
 *
 * Self-contained on purpose: it must run unchanged against older trees that
 * may not carry tests/_appBoot.ts, so it inlines the boot guard it needs
 * (editor present AND the starter text loaded) instead of importing it.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const ROUNDS = Number(process.env.PLAY_ROUNDS || 10)
const MS_FILE = process.env.PLAY_MS_FILE || 'play-ms.txt'

async function isPlaying(page: Page): Promise<boolean> {
  const b = page.locator('[data-testid="strudel-chrome-transport"]')
  await expect(b).toHaveCount(1)
  return ((await b.first().innerText()) || '').includes('Stop')
}

test.describe('probe: first-play latency', () => {
  for (let round = 1; round <= ROUNDS; round++) {
    test(`round ${round}`, async ({ page }) => {
      await page.goto('/')
      // Boot guard, inlined: editor present and starter text nonempty.
      await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 30_000 })
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const m = (window as unknown as {
                monaco?: { editor?: { getModels?: () => Array<{ getValue: () => string }> } }
              }).monaco
              return (m?.editor?.getModels?.() ?? [])[0]?.getValue().length ?? 0
            }),
          { timeout: 30_000 },
        )
        .toBeGreaterThan(0)

      await page.locator('.monaco-editor').first().click()
      const t0 = Date.now()
      await page.keyboard.press(`${MOD}+Enter`)
      await expect.poll(() => isPlaying(page), { timeout: 30_000, intervals: [100] }).toBe(true)
      fs.appendFileSync(MS_FILE, `${Date.now() - t0}\n`)
    })
  }
})
