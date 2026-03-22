
import { ReactNode } from 'react';

export enum Step {
  INITIAL_LOADING,
  MISSION_PRESENTATION,
  AI_DEMO_SPEAKING,
  AI_DEMO_AWAIT_USER,
  BASIC_ROLEPLAY_START,
  BASIC_ROLEPLAY_IN_PROGRESS,
  FIRST_FEEDBACK_LOADING,
  FIRST_FEEDBACK_AWAIT_USER,
  ADVANCED_ROLEPLAY_DEMO,
  ADVANCED_ROLEPLAY_START,
  ADVANCED_ROLEPLAY_IN_PROGRESS,
  FINAL_FEEDBACK_LOADING,
  FINAL_FEEDBACK_AWAIT_USER,
  SHADOWING_AWAIT_USER,
  SHADOWING_IN_PROGRESS,
  SESSION_COMPLETE_AWAIT_USER,
  SESSION_ENDED,
  ERROR
}

export interface DialogueTurn {
  speaker: 'teacher' | 'user';
  sentence: string;
}

export interface KeyExpression {
  english: string;
  korean: string;
}

export interface MissionData {
  missionTitle: string;
  scenario: string;
  keyExpressions: KeyExpression[];
  exampleDialogue: DialogueTurn[];
  tip: string;
}

export interface FirstFeedbackData {
  praise: string;
  newExpressions: KeyExpression[];
}

export interface Correction {
    userSentence: string;
    recommendedSentence: string;
    reason: string;
}

export interface FinalFeedbackData {
    finalPraise: string;
    goodPoints: string;
    corrections: Correction[];
    additionalVocab: KeyExpression[];
    sentenceToMemorize: string;
}

export interface AdvancedDialogueData {
    advancedDialogue: DialogueTurn[];
}

export interface ChatMessage {
  id: string;
  sender: 'gina' | 'user' | 'system';
  text?: string;
  component?: ReactNode;
  timestamp: string;
}

export type AIProvider = 'gemini' | 'openai' | 'ollama' | 'web-service';

export type TargetLanguage = 'en' | 'zh' | 'ja' | 'es' | 'fr';

export interface ProviderConfig {
  modelName: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface GenerationSettings {
  provider: AIProvider;
  providerConfigs: Record<AIProvider, ProviderConfig>;
  temperature: number;
  language: 'ko' | 'en';
  targetLanguage: TargetLanguage;
}

export interface GenerationResult {
    logs: string[];
    explanation: string;
    [key: string]: any;
}
