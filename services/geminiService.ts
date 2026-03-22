
import { GoogleGenAI, Type } from "@google/genai";
import { getSystemPrompt, LANGUAGE_LABELS } from '../constants';
import type { 
    MissionData, 
    FirstFeedbackData, 
    FinalFeedbackData, 
    AdvancedDialogueData, 
    GenerationSettings, 
    AIProvider,
    GenerationResult
} from '../types';

// Default settings similar to exbuilder6-ai-studio
export const DEFAULT_SETTINGS: GenerationSettings = {
    provider: (import.meta.env.VITE_AI_PROVIDER as AIProvider) || 'gemini',
    providerConfigs: {
        gemini: { 
            modelName: import.meta.env.VITE_AI_MODEL || 'gemini-2.0-flash',
            apiKey: import.meta.env.VITE_GEMINI_API_KEY || ''
        },
        openai: { 
            modelName: 'gpt-4o', 
            baseUrl: 'https://api.openai.com/v1' 
        },
        ollama: { 
            modelName: 'qwen2.5-coder:latest', 
            baseUrl: 'http://localhost:11434/v1' 
        },
        'web-service': { 
            modelName: '', 
            baseUrl: import.meta.env.VITE_AI_BASE_URL || 'http://localhost:8080/api/generate' 
        }
    },
    temperature: 0.7,
    language: 'ko',
    targetLanguage: 'en'
};

/**
 * Fetches available models from local Ollama instance
 */
export async function getOllamaModels(): Promise<string[]> {
    try {
        const baseUrl = DEFAULT_SETTINGS.providerConfigs.ollama?.baseUrl?.replace('/v1', '') || 'http://localhost:11434';
        const response = await fetch(`${baseUrl}/api/tags`);
        if (!response.ok) throw new Error('Ollama not running');
        const data = await response.json();
        return data.models.map((m: any) => m.name);
    } catch (error) {
        console.error('Failed to fetch Ollama models:', error);
        return [];
    }
}

// Schemas for Gemini
const missionSchema = {
    type: Type.OBJECT,
    properties: {
        missionTitle: { type: Type.STRING },
        scenario: { type: Type.STRING },
        keyExpressions: {
            type: Type.ARRAY,
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
            items: {
                type: Type.OBJECT,
                properties: {
                    speaker: { type: Type.STRING, enum: ["teacher", "user"] },
                    sentence: { type: Type.STRING },
                },
                required: ["speaker", "sentence"]
            },
        },
        tip: { type: Type.STRING },
    },
    required: ["missionTitle", "scenario", "keyExpressions", "exampleDialogue", "tip"]
};

const firstFeedbackSchema = {
    type: Type.OBJECT,
    properties: {
        praise: { type: Type.STRING },
        newExpressions: {
            type: Type.ARRAY,
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
        finalPraise: { type: Type.STRING },
        goodPoints: { type: Type.STRING },
        corrections: {
            type: Type.ARRAY,
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
            items: {
                type: Type.OBJECT,
                properties: {
                    english: { type: Type.STRING },
                    korean: { type: Type.STRING }
                },
                required: ["english", "korean"]
            }
        },
        sentenceToMemorize: { type: Type.STRING }
    },
    required: ["finalPraise", "goodPoints", "corrections", "additionalVocab", "sentenceToMemorize"]
};

/**
 * Converts a Gemini-style schema to a human-readable example JSON structure
 * so that non-Gemini providers (ollama, openai) can follow the expected format.
 */
function schemaToExample(schema: any): any {
    if (!schema) return {};
    if (schema.type === Type.OBJECT) {
        const result: any = {};
        for (const [key, val] of Object.entries(schema.properties || {})) {
            result[key] = schemaToExample(val);
        }
        return result;
    }
    if (schema.type === Type.ARRAY) {
        return [schemaToExample(schema.items)];
    }
    if (schema.type === Type.STRING) {
        return schema.enum ? schema.enum[0] : "<string>";
    }
    if (schema.type === Type.NUMBER || schema.type === Type.INTEGER) {
        return 0;
    }
    if (schema.type === Type.BOOLEAN) {
        return false;
    }
    return null;
}

async function callProvider<T>(
    stage: string,
    prompt: string,
    schema: any,
    settings: GenerationSettings,
    context: any = null
): Promise<T> {
    const config = settings.providerConfigs[settings.provider];

    const systemPrompt = getSystemPrompt(settings.targetLanguage || 'en');

    if (settings.provider === 'gemini') {
        if (!config.apiKey) throw new Error("Gemini API Key missing");
        const ai = new GoogleGenAI({ apiKey: config.apiKey });
        const response = await ai.models.generateContent({
            model: config.modelName,
            contents: prompt,
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });
        return JSON.parse(response.text.trim()) as T;
    }

    if (settings.provider === 'ollama' || settings.provider === 'openai') {
        const baseUrl = config.baseUrl?.replace(/\/+$/, "") || 'http://localhost:11434/v1';
        const schemaStr = JSON.stringify(schemaToExample(schema), null, 2);
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey || 'ollama'}`
            },
            body: JSON.stringify({
                model: config.modelName,
                messages: [
                    { role: "system", content: systemPrompt + `\nReturn ONLY strictly valid JSON with NO extra text. Your response must match this exact schema:\n${schemaStr}` },
                    { role: "user", content: prompt }
                ],
                temperature: settings.temperature,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error(`API Error: ${await response.text()}`);
        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim()) as T;
    }

    if (settings.provider === 'web-service') {
        if (!config.baseUrl) throw new Error("Web Service Base URL missing");
        const response = await fetch(config.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                systemPrompt,
                stage,
                context,
                settings
            })
        });

        if (!response.ok) throw new Error(`Web Service Error: ${await response.text()}`);
        const result: GenerationResult = await response.json();
        
        // Extract data from explanation if it's a string containing JSON
        if (result.explanation && typeof result.explanation === 'string' && result.explanation.includes('{')) {
            try {
                return JSON.parse(result.explanation.replace(/```json\n?|\n?```/g, "").trim()) as T;
            } catch (e) {
                return result as unknown as T;
            }
        }
        return result as unknown as T;
    }

    throw new Error("Unsupported provider");
}

export const GeminiService = {
    generateInitialMission: async (settings: GenerationSettings, previousMissionTitle?: string, customScenario?: string): Promise<MissionData> => {
        const langLabel = LANGUAGE_LABELS[settings.targetLanguage || 'en'] || '영어';
        const scenarioPart = customScenario
            ? `The user wants to practice this specific situation: "${customScenario}". Build the mission around this scenario. Please create a dialogue consisting of at least 8 to 10 sentences. `
            : `Choose a practical daily-life or business scenario.`;
        const previousPart = previousMissionTitle
            ? `The previous topic was "${previousMissionTitle}", so please choose a different one.`
            : '';
        const prompt = `You are at STEP 1. Generate a new mission in ${langLabel}. All dialogue sentences must be written in ${langLabel}. ${scenarioPart} ${previousPart}`.trim();
        return callProvider<MissionData>("mission", prompt, missionSchema, settings);
    },
    generateFirstFeedback: async (settings: GenerationSettings, userDialogue: string[]): Promise<FirstFeedbackData> => {
        const langLabel = LANGUAGE_LABELS[settings.targetLanguage || 'en'] || '영어';
        const prompt = `You are at STEP 4. The user has completed the first role-play in ${langLabel}. Their spoken sentences were: ${JSON.stringify(userDialogue)}. Provide positive feedback and two new ${langLabel} expressions for an advanced challenge.`;
        return callProvider<FirstFeedbackData>("firstFeedback", prompt, firstFeedbackSchema, settings, { userDialogue });
    },
    generateAdvancedDialogue: async (settings: GenerationSettings, mission: MissionData): Promise<AdvancedDialogueData> => {
        const langLabel = LANGUAGE_LABELS[settings.targetLanguage || 'en'] || '영어';
        const prompt = `You are at STEP 5. The user agreed to the advanced challenge. Based on the initial mission "${mission.missionTitle}: ${mission.scenario}", generate a new, related advanced dialogue in ${langLabel} for the user to practice with.`;
        return callProvider<AdvancedDialogueData>("advancedDialogue", prompt, advancedDialogueSchema, settings, { mission });
    },
    generateFinalFeedback: async (settings: GenerationSettings, mission: MissionData, basicDialogue: string[], advancedDialogue: string[]): Promise<FinalFeedbackData> => {
        const langLabel = LANGUAGE_LABELS[settings.targetLanguage || 'en'] || '영어';
        const prompt = `You are at STEP 6. The user has completed both role-plays in ${langLabel}.
    - Mission: ${mission.missionTitle}
    - Basic Role-play sentences from user: ${JSON.stringify(basicDialogue)}
    - Advanced Role-play sentences from user: ${JSON.stringify(advancedDialogue)}
    Provide comprehensive final feedback based on their performance across both sessions.`;
        return callProvider<FinalFeedbackData>("finalFeedback", prompt, finalFeedbackSchema, settings, { mission, basicDialogue, advancedDialogue });
    }
};
