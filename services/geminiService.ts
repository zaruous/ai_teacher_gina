
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { GINA_SYSTEM_PROMPT } from '../constants';
import type { MissionData, FirstFeedbackData, FinalFeedbackData, DialogueTurn, AdvancedDialogueData } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const missionSchema = {
  type: Type.OBJECT,
  properties: {
    missionTitle: { type: Type.STRING, description: "오늘의 학습 주제 (예: 카페에서 주문하기)" },
    scenario: { type: Type.STRING, description: "학습할 구체적인 상황 시나리오" },
    keyExpressions: {
      type: Type.ARRAY,
      description: "오늘 배울 핵심 표현 5개",
      items: {
        type: Type.OBJECT,
        properties: {
          english: { type: Type.STRING },
          korean: { type: Type.STRING },
        },
        required: ["english", "korean"]
      },
    },
    exampleDialogue: {
      type: Type.ARRAY,
      description: "User와 Teacher 역할의 전체 대화 예시. Teacher가 항상 먼저 말하고 User가 마지막에 말해야 함.",
      items: {
        type: Type.OBJECT,
        properties: {
          speaker: { type: Type.STRING, enum: ["teacher", "user"] },
          sentence: { type: Type.STRING },
        },
        required: ["speaker", "sentence"]
      },
    },
    tip: { type: Type.STRING, description: "오늘의 학습과 관련된 유용한 꿀팁" },
  },
  required: ["missionTitle", "scenario", "keyExpressions", "exampleDialogue", "tip"]
};

const firstFeedbackSchema = {
    type: Type.OBJECT,
    properties: {
        praise: { type: Type.STRING, description: "첫 롤플레이에 대한 구체적인 칭찬 메시지" },
        newExpressions: {
            type: Type.ARRAY,
            description: "응용 롤플레이에 사용할 새로운 영어 표현 2개",
            items: {
                type: Type.OBJECT,
                properties: {
                    english: { type: Type.STRING },
                    korean: { type: Type.STRING }
                },
                required: ["english", "korean"]
            }
        }
    },
    required: ["praise", "newExpressions"]
};

const advancedDialogueSchema = {
    type: Type.OBJECT,
    properties: {
        advancedDialogue: {
            type: Type.ARRAY,
            description: "응용 롤플레이를 위한 새로운 대화. 이전 상황과 연결되어야 함. Teacher가 시작, User가 끝.",
            items: {
                type: Type.OBJECT,
                properties: {
                    speaker: { type: Type.STRING, enum: ["teacher", "user"] },
                    sentence: { type: Type.STRING },
                },
                required: ["speaker", "sentence"]
            }
        }
    },
    required: ["advancedDialogue"]
};


const finalFeedbackSchema = {
    type: Type.OBJECT,
    properties: {
        finalPraise: { type: Type.STRING, description: "세션 전체에 대한 최종 칭찬 및 격려 메시지" },
        goodPoints: { type: Type.STRING, description: "사용자가 잘한 점에 대한 구체적인 칭찬" },
        corrections: {
            type: Type.ARRAY,
            description: "사용자 문장에 대한 교정 제안 (틀린 경우에만)",
            items: {
                type: Type.OBJECT,
                properties: {
                    userSentence: { type: Type.STRING },
                    recommendedSentence: { type: Type.STRING },
                    reason: { type: Type.STRING }
                },
                required: ["userSentence", "recommendedSentence", "reason"]
            }
        },
        additionalVocab: {
            type: Type.ARRAY,
            description: "상황과 관련된 추가 어휘 3개",
            items: {
                type: Type.OBJECT,
                properties: {
                    english: { type: Type.STRING },
                    korean: { type: Type.STRING }
                },
                required: ["english", "korean"]
            }
        },
        sentenceToMemorize: { type: Type.STRING, description: "사용자가 통째로 외우면 좋을 추가 문장 1개" }
    },
    required: ["finalPraise", "goodPoints", "corrections", "additionalVocab", "sentenceToMemorize"]
};


async function generateWithSchema<T>(prompt: string, schema: object): Promise<T> {
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: GINA_SYSTEM_PROMPT,
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as T;
    } catch (error) {
        console.error("Gemini API call failed:", error);
        throw new Error("Failed to get a valid response from the AI. Please try again.");
    }
}


export const GeminiService = {
  generateInitialMission: async (previousMissionTitle?: string): Promise<MissionData> => {
    const prompt = `You are at STEP 1. Generate a new mission. ${previousMissionTitle ? `The previous topic was "${previousMissionTitle}", so please choose a different one.` : ''}`;
    return generateWithSchema<MissionData>(prompt, missionSchema);
  },
  generateFirstFeedback: async (userDialogue: string[]): Promise<FirstFeedbackData> => {
    const prompt = `You are at STEP 4. The user has completed the first role-play. Their spoken sentences were: ${JSON.stringify(userDialogue)}. Provide positive feedback and two new expressions for an advanced challenge.`;
    return generateWithSchema<FirstFeedbackData>(prompt, firstFeedbackSchema);
  },
  generateAdvancedDialogue: async (mission: MissionData): Promise<AdvancedDialogueData> => {
    const prompt = `You are at STEP 5. The user agreed to the advanced challenge. Based on the initial mission "${mission.missionTitle}: ${mission.scenario}", generate a new, related advanced dialogue for the user to practice with.`;
    return generateWithSchema<AdvancedDialogueData>(prompt, advancedDialogueSchema);
  },
  generateFinalFeedback: async (mission: MissionData, basicDialogue: string[], advancedDialogue: string[]): Promise<FinalFeedbackData> => {
    const prompt = `You are at STEP 6. The user has completed both role-plays.
    - Mission: ${mission.missionTitle}
    - Basic Role-play sentences from user: ${JSON.stringify(basicDialogue)}
    - Advanced Role-play sentences from user: ${JSON.stringify(advancedDialogue)}
    Provide comprehensive final feedback based on their performance across both sessions.`;
    return generateWithSchema<FinalFeedbackData>(prompt, finalFeedbackSchema);
  }
};
