import asyncio
import os
import re
from playwright.async_api import async_playwright

async def join_group_web_direct(group_url, message):
    async with async_playwright() as p:
        profile_path = os.path.join(os.getcwd(), "zalo_user_data")
        
        context = await p.chromium.launch_persistent_context(
            profile_path,
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )
        
        page = context.pages[0] if context.pages else await context.new_page()
        page.set_default_timeout(0)

        try:
            # BƯỚC 1: Xử lý link để vào thẳng chat.zalo.me
            # Thay vì vào zalo.me/g/abc, ta vào thẳng chat.zalo.me/?g=abc
            group_id = re.search(r'g/([a-z0-9]+)', group_url)
            if group_id:
                direct_url = f"https://chat.zalo.me/?g={group_id.group(1)}"
            else:
                direct_url = group_url

            print(f"--- [SYSTEM] Đang truy cập thẳng Zalo Web: {direct_url} ---")
            await page.goto(direct_url, timeout=0)

            # BƯỚC 2: Tìm nút "Tham gia nhóm" trong giao diện Zalo Web (nếu có)
            # Thường thì vào thẳng link ?g= nó sẽ hiện một bảng xác nhận trong Web
            print("[INFO] Đang đợi giao diện Web ổn định...")
            await asyncio.sleep(5)

            # BƯỚC 3: Nhắm mục tiêu thần tốc vào #input_line_0
            line_selector = "#input_line_0"
            
            print("[PROCESS] Đang quét tìm ô nhập liệu...")
            # Đợi ô chat xuất hiện (Zalo Web có thể hỏi xác nhận Tham gia, bạn hãy bấm tay nếu bot chưa tự bấm được)
            target_line = await page.wait_for_selector(line_selector, timeout=0)
            
            if target_line:
                print("[SUCCESS] Đã thấy ô chat. Tiến hành bơm tin nhắn...")
                await target_line.click()
                
                await page.evaluate(f"""
                    (text) => {{
                        const line = document.getElementById('input_line_0');
                        if (line) {{
                            line.focus();
                            line.innerText = text;
                            line.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        }}
                    }}
                """, message)
                
                await asyncio.sleep(1)
                await page.keyboard.press("Enter")
                print(f"--- [DONE] Đã gửi tin vào nhóm thành công! ---")

        except Exception as e:
            print(f"[ERROR] Sự cố kỹ thuật: {e}")
        
        # GIỮ TRÌNH DUYỆT - KHÔNG TẮT
        print("[IDLE] Đã xong. Trình duyệt đang giữ nguyên trạng thái.")
        while True:
            await asyncio.sleep(3600)

# --- CẤU HÌNH ---
GROUP_LINK = "https://zalo.me/g/pmwzaa967"
CONTENT = "Tin nhắn thử nghiệm gửi thẳng vào giao diện Zalo Web."

if __name__ == "__main__":
    asyncio.run(join_group_web_direct(GROUP_LINK, CONTENT))