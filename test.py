import asyncio
import os
from playwright.async_api import async_playwright

async def send_zalo_no_timeout_final(phone, message):
    async with async_playwright() as p:
        profile_path = os.path.join(os.getcwd(), "zalo_user_data")

        context = await p.chromium.launch_persistent_context(
            profile_path,
            headless=False,  # 👈 để nhìn thấy rõ
            args=["--disable-blink-features=AutomationControlled"],
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )

        page = context.pages[0] if context.pages else await context.new_page()
        page.set_default_timeout(0)

        try:
            print(f"--- [SYSTEM] Đang nhắm mục tiêu: {phone} ---")
            await page.goto(f"https://chat.zalo.me/?phone={phone}", timeout=0)

            # ⏳ Cho Zalo render / redirect
            await asyncio.sleep(3)

            # 🔥 CHỤP TOÀN MÀN HÌNH – ĐƠN GIẢN NHẤT
            await page.screenshot(
                path="zalo_full_screen.png",
                full_page=True
            )
            print("[INFO] 📸 Đã chụp toàn màn hình: zalo_full_screen.png")

            # ===== CODE GỐC CỦA BẠN =====

            print("[INFO] Đang tìm thẻ truncate 'Nhắn tin'...")
            btn_chat_selector = 'div[data-translate-inner="STR_CHAT"]'

            try:
                chat_btn = await page.wait_for_selector(btn_chat_selector, timeout=0)
                if chat_btn:
                    print("[PROCESS] Đã thấy nút 'Nhắn tin', đang click...")
                    await chat_btn.click()
                    await asyncio.sleep(2)
            except Exception as e:
                print(f"[INFO] Bỏ qua bước click nút: {e}")

            print("[INFO] Đang đợi mục tiêu line_0 xuất hiện...")
            target_line = await page.wait_for_selector("#input_line_0", timeout=0)
            await target_line.click()

            await page.evaluate("""
                (text) => {
                    const line = document.getElementById('input_line_0');
                    if (line) {
                        line.innerText = text;
                        line.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            """, message)

            await page.keyboard.press("Enter")
            print(f"[SUCCESS] 🚀 Đã gửi tin nhắn đến {phone}")

            await asyncio.sleep(5)

        except Exception as e:
            print(f"[ERROR] {e}")
            await page.screenshot(path="debug_error.png", full_page=True)

        finally:
            await context.close()


# ===== RUN =====
if __name__ == "__main__":
    TARGET_PHONE = "0855427989"
    MESSAGE_TEXT = "Hệ thống CyberBot đã gửi tin nhắn!"

    asyncio.run(send_zalo_no_timeout_final(TARGET_PHONE, MESSAGE_TEXT))
