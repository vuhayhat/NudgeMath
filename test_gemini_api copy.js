import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "AIzaSyCWFpOMk4s2ljhR7N7La9gmUGpBmk0vSQg";
// Đây là lựa chọn MIỄN PHÍ mạnh nhất trong danh sách của bạn
const MODEL_NAME = "gemini-2.0-flash"; 

const genAI = new GoogleGenerativeAI(API_KEY);

async function bootSystem() {
  console.log("==========================================");
  console.log("--- KẾT NỐI HỆ THỐNG GEMINI FREE ---");
  
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    
    // Một câu hỏi kiểm tra logic đơn giản
    const prompt = "Xác nhận trạng thái hệ thống. Bạn là model nào?";

    console.log(`>>> Đang truy cập model miễn phí: ${MODEL_NAME}...`);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    console.log("------------------------------------------");
    console.log(">>> [TRẠNG THÁI]: KẾT NỐI THÀNH CÔNG");
    console.log(">>> [AI]:", response.text());
    console.log("------------------------------------------");

  } catch (error) {
    console.error("!!! [LỖI]:", error.message);
  } finally {
    console.log("--- GIAO THỨC KẾT THÚC ---");
    console.log("==========================================");
  }
}

bootSystem();