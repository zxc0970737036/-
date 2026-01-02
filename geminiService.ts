
import { GoogleGenAI } from "@google/genai";
import { getSystemInstruction, getPrompt } from "./constants";

export class GeminiService {
  private ai: any;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  private handleError(error: any): string {
    const msg = error?.message || String(error);
    console.error("Gemini API Error:", error);

    if (msg.includes("API key not valid")) {
      return "API 金鑰無效，請檢查設定。";
    }
    if (msg.includes("safety") || msg.includes("candidate was blocked")) {
      return "內容被安全過濾器攔截，請嘗試更換表情描述。";
    }
    if (msg.includes("quota") || msg.includes("429")) {
      return "超過 API 使用配額，請稍後再試。";
    }
    if (msg.includes("overloaded") || msg.includes("503")) {
      return "伺服器忙碌中，請稍後重試。";
    }
    if (msg.includes("NetworkError") || msg.includes("fetch")) {
      return "網路連線異常，請檢查您的網路狀態。";
    }
    return `生成失敗: ${msg.substring(0, 50)}${msg.length > 50 ? '...' : ''}`;
  }

  async translateToEnglish(text: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Translate the following expression word to a short English descriptive phrase (e.g. "smiling happily" or "very angry"). Return only the translated English text. Text to translate: "${text}"`,
      });
      return response.text.trim();
    } catch (error) {
      console.error("Translation error:", error);
      return text; // Fallback to original
    }
  }

  async generateExpressionImage(base64Image: string, expressionEn: string, bgColor: string): Promise<string> {
    try {
      const prompt = getPrompt(expressionEn, bgColor);
      const systemInstruction = getSystemInstruction(bgColor);
      
      // Clean base64 string
      const data = base64Image.split(',')[1];
      const mimeType = base64Image.split(',')[0].split(':')[1].split(';')[0];

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: data,
                mimeType: mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          systemInstruction: systemInstruction,
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      let imageUrl = '';
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (!imageUrl) {
        throw new Error("模型未返回圖片數據，可能被過濾攔截。");
      }

      return imageUrl;
    } catch (error) {
      throw new Error(this.handleError(error));
    }
  }
}
