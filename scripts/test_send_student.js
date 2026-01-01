import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const phone = '0855427989'
const message = 'Tin nhắn thử nghiệm từ NudgeMath'

async function main() {
  const profileDir = path.join(process.cwd(), 'zalo_user_data')
  try { fs.mkdirSync(profileDir, { recursive: true }) } catch {}
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: ua
  })
  const page = context.pages[0] || await context.newPage()
  page.setDefaultTimeout(0)
  const url = `https://chat.zalo.me/?phone=${encodeURIComponent(phone)}`
  await page.goto(url, { timeout: 0 })
  try { await page.screenshot({ path: path.join(process.cwd(), 'zalo_full_screen_test.png'), fullPage: true }) } catch {}
  try {
    const chatBtn = await page.waitForSelector('div[data-translate-inner="STR_CHAT"]', { timeout: 0 })
    if (chatBtn) {
      await chatBtn.click()
      await new Promise(r => setTimeout(r, 2000))
    }
  } catch {}
  const input = await page.waitForSelector('#input_line_0', { timeout: 0 })
  if (input) {
    await input.click()
    await page.evaluate((text) => {
      const line = document.getElementById('input_line_0')
      if (line) {
        line.innerText = text
        line.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, message)
    await page.keyboard.press('Enter')
  }
  await new Promise(r => setTimeout(r, 3000))
  await context.close()
}

main().catch(() => process.exit(1))
