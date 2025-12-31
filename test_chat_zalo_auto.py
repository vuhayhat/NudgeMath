import requests
import json
from zlapi import ZaloAPI
from zlapi.models import Message, ThreadType

class CyberBot(ZaloAPI):
    def __init__(self, cookie, imei, user_agent):
        # Khởi tạo state thủ công
        from zlapi._state import State
        self._state = State()
        self._state.user_agent = user_agent
        self._state.imei = imei
        self._state.set_cookies({"zpw_sek": cookie})
        print(f"--- [SYSTEM] Đã nạp Cookie & IMEI vào hệ thống ---")

    def get_uid_from_phone(self, phone):
        """Tự xây dựng hàm tìm kiếm UID từ số điện thoại"""
        url = "https://wapi.zalo.me/api/friend/search"
        params = {"phone": phone, "avatarSize": 240, "grid_type": 1}
        headers = {"User-Agent": self._state.user_agent}
        cookies = self._state.get_cookies()
        
        try:
            response = requests.get(url, params=params, cookies=cookies, headers=headers)
            data = response.json()
            if data.get("error_code") == 0:
                return data.get("data", {}).get("uid")
        except Exception as e:
            print(f"[!] Lỗi khi tìm UID: {e}")
        return None

    def send_message_to_phone(self, phone, text):
        """Hàm chính để gửi tin nhắn cho khách hàng qua SĐT"""
        uid = self.get_uid_from_phone(phone)
        
        if not uid or str(uid) == "0":
            print(f"[FAIL] Không tìm thấy khách hàng dùng số: {phone}")
            return

        print(f"[SUCCESS] Đã tìm thấy khách hàng (UID: {uid})")
        
        # Thử các hàm gửi tin nhắn khả thi trong zlapi
        msg = Message(text=text)
        try:
            # Ưu tiên dùng hàm send gốc nếu nó tồn tại ẩn
            self.send(msg, thread_id=uid, thread_type=ThreadType.USER)
            print(f"[DONE] Đã gửi thông điệp đến khách hàng {phone}")
        except Exception:
            try:
                # Cách gửi thủ công qua endpoint nếu hàm send bị lỗi
                print("[INFO] Đang thử phương thức gửi tin nhắn dự phòng...")
                self.send_message(msg, thread_id=uid, thread_type=ThreadType.USER)
                print(f"[DONE] Đã gửi thông điệp đến khách hàng {phone}")
            except Exception as e:
                print(f"[CRITICAL] Không thể gửi tin nhắn: {e}")

# --- CẤU HÌNH ---
COOKIE = "s9AN.301690314.a0.gKVBIXtNG87NkhkGFDT0WMRr9Ue_xMBENxKop5650RLFjWJ9RPitmqUIBlDwwdsZOACYTWdedJ6Rrke0IBv0WG"
IMEI = "efe7e642-36ff-42cd-ad73-7c20532bca63-2204ee63bef2f351470a66ffe1bb020e"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# Khởi chạy
client = CyberBot(COOKIE, IMEI, UA)

# Danh sách khách hàng cần nhắn (Ví dụ)
customers = ["0855427989"] 
content = "Chào anh/chị, đây là thông báo tự động từ hệ thống chăm sóc khách hàng."

for p in customers:
    client.send_message_to_phone(p, content)