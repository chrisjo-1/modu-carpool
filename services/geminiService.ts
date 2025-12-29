
import { GoogleGenAI } from "@google/genai";
import { CarpoolSubmission, UserRole } from "../types";

// Initialize Gemini API with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateProfileSummary = async (submission: CarpoolSubmission): Promise<string> => {
  try {
    const roleText = submission.role === UserRole.DRIVER ? '운전자' : '탑승자';
    const genderText = submission.gender === 'MALE' ? '남성' : (submission.gender === 'FEMALE' ? '여성' : '기타');
    
    let infoText = "";
    if (submission.role === UserRole.DRIVER) {
      infoText = `차량: ${submission.carModel}, 자기소개: ${submission.introduction}`;
    } else {
      const dep = submission.departure;
      const dest = submission.destination;
      const depStr = dep ? `${dep.city} ${dep.neighborhood}` : '미지정';
      const destStr = dest ? `${dest.city} ${dest.neighborhood}` : '미지정';
      infoText = `출발지: ${depStr}, 도착지: ${destStr}, 키워드: ${submission.keywords.join(', ')}`;
    }

    const prompt = `
      다음 카풀 신청 데이터를 바탕으로 상대방에게 신뢰감을 주는 한 줄 요약을 작성해줘.
      역할: ${roleText}
      성별: ${genderText}
      직업: ${submission.job}
      ${infoText}
      
      한국어로 친절하고 신뢰감 있게 한 문장으로 작성해줘.
    `;

    // Use ai.models.generateContent to get a summary from the model.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
      },
    });

    // Access the text property directly from the response.
    return response.text?.trim() || "신뢰할 수 있는 카풀 파트너입니다.";
  } catch (error) {
    console.error("Gemini optimization error:", error);
    return "신뢰할 수 있는 카풀 파트너입니다.";
  }
};
