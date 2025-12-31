import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "AIzaSyDbKbQJjHz7uFi0uEsYYIk-hiObEkr_DXM";
const genAI = new GoogleGenerativeAI(API_KEY);

async function scanAvailableModels() {
  console.log("==========================================");
  console.log("--- KHỞI CHẠY GIAO THỨC QUÉT MODEL ---");
  
  try {
    // Sử dụng fetch thuần để gọi API liệt kê model vì đôi khi thư viện bị giới hạn
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    console.log(">>> CÁC MODEL KHẢ DỤNG CHO KEY CỦA BẠN:");
    console.log("------------------------------------------");
    
    // Lọc ra các model có thể tạo nội dung (generateContent)
    const availableModels = data.models
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", ""));

    availableModels.forEach((model, index) => {
      console.log(`${index + 1}. ${model}`);
    });

    console.log("------------------------------------------");
    
    if (availableModels.length > 0) {
      console.log(`>>> GỢI Ý: Hãy thử thay MODEL_NAME bằng: "${availableModels[0]}"`);
    } else {
      console.log("!!! CẢNH BÁO: Không tìm thấy model nào hỗ trợ tạo nội dung.");
    }

  } catch (error) {
    console.error("!!! [LỖI TRUY QUÉT]:", error.message);
    console.log(">>> GỢI Ý: Kiểm tra xem 'Generative Language API' đã được bật trong Google Cloud Console chưa.");
  } finally {
    console.log("--- KẾT THÚC QUÉT ---");
    console.log("==========================================");
  }
}

scanAvailableModels();