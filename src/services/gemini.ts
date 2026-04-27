import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export interface DiagnosisResult {
  isSkinNailRelated: boolean;
  diseaseName: string;
  confidence: number;
  explanation: string;
  medications: string;
  precautions: string;
}

export async function analyzeCondition(
  imageContent: string, 
  symptoms: string, 
  habits: string
): Promise<DiagnosisResult> {
  const model = "gemini-3-flash-preview";

  const prompt = `
    You are a professional Medical Diagnostic AI specializing in Dermatology. 
    Your primary goal is absolute clinical accuracy. Perform a systematic visual audit of the image before reaching a conclusion.
    
    Diagnostic Protocol:
    1. Texture Analysis: Identify inflammation, scaling, macules, or papules.
    2. Border Assessment: Check if edges are circumscribed or irregular.
    3. Color Inventory: Note pigmentation shifts (erythema, hyperpigmentation).
    4. Integration: Cross-reference visual findings with the provided symptoms and habits.
    
    Symptoms: ${symptoms}
    Habits/Lifestyle: ${habits}

    Logic Constraints:
    - Return ONLY JSON.
    - confidence: MUST be an integer between 0 and 100.
    - IF NOT SKIN/NAIL: { "isSkinNailRelated": false, "diseaseName": "Invalid Input", "confidence": 0, "explanation": "Visual check failed: The image is not human skin or nails.", "medications": "N/A", "precautions": "N/A" }
    - IF SKIN/NAIL BUT HEALTHY: If no pathology is observed, result as "Healthy Skin/Nail".
    - IF DISEASE DETECTED: Be specific (e.g., 'Tinea Corporis' vs 'Fungal Infection'). If multiple conditions are possible, list the most likely one and mention differential diagnoses in the 'explanation'.
    - medications: Provide 'General Guidance' for non-prescription care.
  `;

  // Process image
  const base64Data = imageContent.split(",")[1] || imageContent;
  const mimeMatch = imageContent.match(/data:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

  const imagePart = {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };

  const response = await ai.models.generateContent({
    model,
    contents: { parts: [imagePart, { text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isSkinNailRelated: { type: Type.BOOLEAN },
          diseaseName: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          explanation: { type: Type.STRING },
          medications: { type: Type.STRING },
          precautions: { type: Type.STRING },
        },
        required: ["isSkinNailRelated", "diseaseName", "confidence", "explanation", "medications", "precautions"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("Diagnostic stream terminated unexpectedly.");
  const data = JSON.parse(text);
  
  // Defensive normalization: if model returns 0.95 instead of 95
  if (data.confidence > 0 && data.confidence <= 1) {
    data.confidence = Math.round(data.confidence * 100);
  } else {
    data.confidence = Math.round(data.confidence);
  }

  return data;
}
