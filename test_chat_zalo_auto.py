import asyncio
import os
from playwright.async_api import async_playwright

async def send_zalo_no_timeout_final(phone, message):
    async with async_playwright() as p:
        profile_path = os.path.join(os.getcwd(), "zalo_user_data")
        
        context = await p.chromium.launch_persistent_context(
            profile_path,
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )
        
        page = context.pages[0] if context.pages else await context.new_page()
        
        # Vô hiệu hóa mọi giới hạn thời gian (Timeout = 0)
        page.set_default_timeout(0)

        try:
            print(f"--- [SYSTEM] Đang nhắm mục tiêu: {phone} ---")
            await page.goto(f"https://chat.zalo.me/?phone={phone}", timeout=0)

            # 1. TÌM VÀ NHẤP VÀO NÚT NHẮN TIN (Thẻ truncate)
            print("[INFO] Đang tìm thẻ truncate 'Nhắn tin'...")
            # Nhắm mục tiêu chính xác vào data-translate-inner="STR_CHAT"
            btn_chat_selector = 'div[data-translate-inner="STR_CHAT"]'
            
            try:
                # Đợi cho đến khi cái nút này xuất hiện (không giới hạn thời gian)
                chat_btn = await page.wait_for_selector(btn_chat_selector, timeout=0)
                if chat_btn:
                    print("[PROCESS] Đã thấy nút 'Nhắn tin', đang click...")
                    await chat_btn.click()
                    # Chờ 2 giây để giao diện chat line_0 kịp render
                    await asyncio.sleep(2)
            except Exception as e:
                print(f"[INFO] Bỏ qua bước click nút (Có thể đã vào thẳng chat): {e}")

            # 2. TẤN CÔNG VÀO DÒNG NHẬP LIỆU line_0
            line_selector = "#input_line_0"
            print(f"[INFO] Đang đợi mục tiêu line_0 xuất hiện...")
            
            # Đợi line_0 xuất hiện vĩnh viễn
            target_line = await page.wait_for_selector(line_selector, timeout=0)
            
            # Đảm bảo phần tử được focus
            await target_line.click()
            
            # Bơm dữ liệu bằng Script thực thi trực tiếp trên trình duyệt
            await page.evaluate(f"""
                (text) => {{
                    const line = document.getElementById('input_line_0');
                    if (line) {{
                        line.innerText = text;
                        // Kích hoạt phản ứng của hệ thống Zalo
                        line.dispatchEvent(new Event('input', {{ bubbles: true }}));
                    }}
                }}
            """, message)
            
            # Nhấn Enter để kết thúc nhiệm vụ
            await page.keyboard.press("Enter")
            
            print(f"[SUCCESS] Dữ liệu đã truyền thành công đến {phone}")
            
            # Giữ lại 5s để xác nhận tin nhắn đã chuyển trạng thái "Đã gửi"
            await asyncio.sleep(5)

        except Exception as e:
            print(f"[ERROR] Sự cố: {e}")
            await page.screenshot(path="debug_truncate_error.png")
        finally:
            await context.close()

# --- THÔNG SỐ TEST ---
TARGET_PHONE = "0975678109"
MESSAGE_TEXT = "Hệ thống CyberBot đã nhấp vào thẻ Truncate và gửi tin thành công!"

if __name__ == "__main__":
    asyncio.run(send_zalo_no_timeout_final(TARGET_PHONE, MESSAGE_TEXT))