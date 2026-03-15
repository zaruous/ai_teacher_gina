import { useState, useRef, useCallback, useEffect } from 'react';

// Define types for the Web Speech API to fix TypeScript errors.
// These types are not included in standard TS DOM libraries as the API is experimental.
interface ISpeechRecognition {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onresult: (event: any) => void;
  onend: () => void;
  onerror: (event: { error: string }) => void;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionStatic {
    new (): ISpeechRecognition;
}

// Augment the window object to let TypeScript know about SpeechRecognition and webkitSpeechRecognition.
declare global {
    interface Window {
        SpeechRecognition: SpeechRecognitionStatic;
        webkitSpeechRecognition: SpeechRecognitionStatic;
    }
}


// Polyfill for cross-browser compatibility
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const useSpeech = () => {
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
    const recognitionRef = useRef<ISpeechRecognition | null>(null);
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

    // Load available voices (fires async on most browsers)
    useEffect(() => {
        const loadVoices = () => {
            const all = window.speechSynthesis.getVoices();
            if (all.length > 0) setVoices(all);
        };
        loadVoices();
        window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
        return () => {
            window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
        };
    }, []);

    const setVoice = useCallback((voice: SpeechSynthesisVoice | null) => {
        selectedVoiceRef.current = voice;
    }, []);

    // Effect to initialize recognition engine
    useEffect(() => {
        if (!SpeechRecognition) {
            console.error("Speech Recognition not supported in this browser.");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.interimResults = false;

        recognitionRef.current = recognition;

        return () => {
            recognition.stop();
        };
    }, []);
    
    // Cleanup synthesis on unmount
    useEffect(() => {
      return () => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
      }
    }, []);

    const speak = useCallback((text: string, onEnd?: () => void) => {
        if (!window.speechSynthesis) {
            console.error("Speech Synthesis not supported in this browser.");
            onEnd?.();
            return;
        }

        // Cancel any ongoing speech
        if(window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        const isEnglish = !!text.match(/[a-zA-Z]/);
        utterance.lang = isEnglish ? 'en-US' : 'ko-KR';
        utterance.rate = 0.9;

        if (isEnglish && selectedVoiceRef.current) {
            utterance.voice = selectedVoiceRef.current;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            onEnd?.();
        };
        utterance.onerror = (event) => {
            console.error("SpeechSynthesis Error", event);
            setIsSpeaking(false);
            onEnd?.();
        };
        
        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    }, []);
    
    const startListening = useCallback((onResult: (transcript: string) => void) => {
        const recognition = recognitionRef.current;
        if (!recognition || isListening) return;

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            onResult(transcript);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            setIsListening(false);
        };

        setIsListening(true);
        recognition.start();
    }, [isListening]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    }, [isListening]);

    const cancelSpeech = useCallback(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
    }, []);

    return { isListening, isSpeaking, speak, startListening, stopListening, cancelSpeech, voices, setVoice };
};
