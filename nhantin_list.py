import asyncio
import os
from playwright.async_api import async_playwright

async def cyber_broadcast_and_stay(message_text):
    async with async_playwright() as p:
        profile_path = os.path.join(os.getcwd(), "zalo_user_data")
        
        # Mở trình duyệt với cấu hình Cyberpunk
        context = await p.chromium.launch_persistent_context(
            profile_path,
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        )
        
        page = context.pages[0] if context.pages else await context.new_page()
        page.set_default_timeout(0)

        try:
            print("--- [SYSTEM] ĐANG QUÉT DANH SÁCH - TRÌNH DUYỆT SẼ GIỮ NGUYÊN ---")
            await page.goto("https://chat.zalo.me/", timeout=0)
            
            # Đợi danh sách chat tải xong
            await page.wait_for_selector(".msg-item", timeout=0)
            
            sent_list = set() 
            no_new_count = 0 # Đếm số lần cuộn mà không thấy người mới

            while True:
                items = await page.query_selector_all(".msg-item")
                new_items_found = False
                
                for item in items:
                    conv_id = await item.get_attribute("anim-data-id")
                    
                    if conv_id and conv_id not in sent_list:
                        new_items_found = True
                        no_new_count = 0
                        try:
                            # Lấy tên hiển thị từ HTML bạn cung cấp
                            name_el = await item.query_selector(".conv-item-title__name")
                            name = await name_el.inner_text() if name_el else "Unknown"
                            
                            print(f"\n[TARGET] Đang nhắn cho: {name.strip()}")
                            
                            # Click chọn người này
                            await item.click()
                            await asyncio.sleep(2) 

                            # Nhập liệu vào line_0
                            line_selector = "#input_line_0"
                            await page.wait_for_selector(line_selector, timeout=5000)
                            
                            await page.evaluate(f"""
                                (text) => {{
                                    const line = document.getElementById('input_line_0');
                                    if (line) {{
                                        line.innerText = text;
                                        line.dispatchEvent(new Event('input', {{ bubbles: true }}));
                                    }}
                                }}
                            """, message_text)
                            
                            await page.keyboard.press("Enter")
                            print(f"[SUCCESS] Đã gửi xong cho {name.strip()}")
                            
                            sent_list.add(conv_id)
                            
                            # Nghỉ 20 giây để tránh bị Zalo đánh dấu spam
                            await asyncio.sleep(20)
                            
                        except Exception as e:
                            print(f"[ERROR] Lỗi tại {conv_id}: {e}")
                            continue

                # Nếu không còn ai mới trên màn hình hiện tại -> Cuộn xuống
                if not new_items_found:
                    no_new_count += 1
                    print(f"[SCROLL] Đang tìm thêm danh sách cũ (Lần {no_new_count})...")
                    await page.evaluate("""
                        const container = document.querySelector('.ReactVirtualized__Grid__innerScrollContainer').parentElement;
                        if (container) container.scrollTop += 800;
                    """)
                    await asyncio.sleep(3)
                    
                    # Nếu cuộn 5 lần liên tiếp mà không có người mới -> Coi như hết danh sách
                    if no_new_count > 5:
                        print("\n--- [FINISHED] Đã nhắn hết toàn bộ danh sách tìm thấy! ---")
                        break
                
        except KeyboardInterrupt:
            print("\n--- [STOP] Dừng script bởi người dùng ---")
        except Exception as e:
            print(f"\n--- [SYSTEM ERROR] {e} ---")
        
        # GIỮ TRÌNH DUYỆT MỞ VÔ TẬN
        print("[IDLE] Script đã hoàn thành nhiệm vụ. Trình duyệt vẫn giữ nguyên để bạn sử dụng.")
        while True:
            await asyncio.sleep(3600)

# --- NỘI DUNG GỬI ---
CONTENT = "Chào bạn, mình đang gửi tin nhắn tự động theo danh sách."

if __name__ == "__main__":
    asyncio.run(cyber_broadcast_and_stay(CONTENT))