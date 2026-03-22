
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Step, type ChatMessage, type MissionData, type DialogueTurn, type FirstFeedbackData, type FinalFeedbackData, type AdvancedDialogueData, KeyExpression, type GenerationSettings, type AIProvider } from './types';
import { GeminiService, DEFAULT_SETTINGS, getOllamaModels } from './services/geminiService';
import { useSpeech } from './hooks/useSpeech';
import LoadingSpinner from './components/LoadingSpinner';
import { MicrophoneIcon, PlayIcon, RefreshIcon, CheckIcon, HamburgerIcon, XIcon, DownloadIcon } from './components/Icons';

const SETTINGS_KEY = 'gina_ai_settings';

const App: React.FC = () => {
    const [step, setStep] = useState<Step>(Step.INITIAL_LOADING);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [missionData, setMissionData] = useState<MissionData | null>(null);
    const [firstFeedback, setFirstFeedback] = useState<FirstFeedbackData | null>(null);
    const [advancedDialogue, setAdvancedDialogue] = useState<AdvancedDialogueData | null>(null);
    const [finalFeedback, setFinalFeedback] = useState<FinalFeedbackData | null>(null);
    const [userRoleplayTranscript, setUserRoleplayTranscript] = useState<string[]>([]);
    const [userAdvancedRoleplayTranscript, setUserAdvancedRoleplayTranscript] = useState<string[]>([]);
    const [currentRoleplayTurn, setCurrentRoleplayTurn] = useState(0);
    const [currentShadowingIndex, setCurrentShadowingIndex] = useState(0);
    const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
    const [customScenarioInput, setCustomScenarioInput] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [settings, setSettings] = useState<GenerationSettings>(() => {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Ensure provider is set
                if (!parsed.provider) parsed.provider = 'gemini';
                return parsed;
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
        return DEFAULT_SETTINGS;
    });

    // Fetch Ollama models when provider is ollama
    useEffect(() => {
        const fetchModels = async () => {
            if (settings.provider === 'ollama') {
                const models = await getOllamaModels();
                setAvailableOllamaModels(models);
                
                // If current model is not in the list, set the first available one
                if (models.length > 0 && (!settings.providerConfigs.ollama?.modelName || !models.includes(settings.providerConfigs.ollama.modelName))) {
                    setSettings(prev => ({
                        ...prev,
                        providerConfigs: {
                            ...prev.providerConfigs,
                            ollama: {
                                ...prev.providerConfigs.ollama,
                                modelName: models[0],
                                baseUrl: prev.providerConfigs.ollama?.baseUrl || 'http://localhost:11434/v1'
                            }
                        }
                    }));
                }
            }
        };
        fetchModels();
    }, [settings.provider]);

    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);
    
    const { isListening, isSpeaking, speak, startListening, stopListening, cancelSpeech, voices, setVoice } = useSpeech();
    const [selectedVoiceName, setSelectedVoiceName] = useState<string>(
        () => localStorage.getItem('gina_voice') ?? ''
    );

    const englishVoices = voices.filter(v => v.lang.startsWith('en'));

    // voices가 비동기로 로드된 후 저장된 목소리를 자동 적용
    useEffect(() => {
        if (voices.length === 0 || !selectedVoiceName) return;
        const voice = voices.find(v => v.name === selectedVoiceName) ?? null;
        setVoice(voice);
    }, [voices, selectedVoiceName, setVoice]);

    const handleVoiceChange = (name: string) => {
        setSelectedVoiceName(name);
        if (name) {
            localStorage.setItem('gina_voice', name);
        } else {
            localStorage.removeItem('gina_voice');
        }
        const voice = voices.find(v => v.name === name) ?? null;
        setVoice(voice);
    };
    const chatEndRef = useRef<HTMLDivElement>(null);

    const addMessage = useCallback((sender: ChatMessage['sender'], text?: string, component?: React.ReactNode) => {
        setMessages(prev => [...prev, {
            id: `msg-${Date.now()}-${Math.random()}`,
            sender,
            text,
            component,
            timestamp: new Date().toLocaleTimeString(),
        }]);
    }, []);

    const scrollToBottom = () => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);
    
    const handleError = (error: any) => {
        console.error(error);
        setStep(Step.ERROR);
        addMessage('system', `An error occurred: ${error.message}`);
    }

    const startNewSession = useCallback(async (customScenario?: string) => {
        setStep(Step.INITIAL_LOADING);
        setMessages([]);
        setUserRoleplayTranscript([]);
        setUserAdvancedRoleplayTranscript([]);
        setMissionData(null);
        setFirstFeedback(null);
        setFinalFeedback(null);
        setAdvancedDialogue(null);
        setCurrentRoleplayTurn(0);
        setCurrentShadowingIndex(0);
        setCustomScenarioInput('');
        cancelSpeech();

        try {
            const data = await GeminiService.generateInitialMission(settings, missionData?.missionTitle, customScenario);
            setMissionData(data);
            setStep(Step.MISSION_PRESENTATION);
        } catch (error) {
            handleError(error);
        }
    }, [missionData?.missionTitle, addMessage, cancelSpeech, settings]);

    // 앱 시작 시 상황 입력 모달 표시
    useEffect(() => {
        setIsScenarioModalOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if(step === Step.MISSION_PRESENTATION && missionData) {
            addMessage('system', undefined, <MissionCard mission={missionData} />);
        }
    }, [step, missionData, addMessage]);


    const handleStartDemo = useCallback(() => {
        if (!missionData) return;
        setStep(Step.AI_DEMO_SPEAKING);
        addMessage('gina', "안녕하세요! 튜터 지나입니다. 제가 먼저 대화 시연을 보여드릴게요.");
        speak("Hello! I am Tutor Gina. I'll demonstrate the conversation for you first.", () => {
            const playDialogue = (index: number) => {
                if (index >= missionData.exampleDialogue.length) {
                    speak("준비되셨나요?", () => setStep(Step.AI_DEMO_AWAIT_USER));
                    addMessage('gina', "준비되셨나요?");
                    return;
                }
                const turn = missionData.exampleDialogue[index];
                addMessage('gina', `${turn.speaker === 'teacher' ? 'Tutor' : 'You'}: ${turn.sentence}`);
                speak(turn.sentence, () => playDialogue(index + 1));
            };
            playDialogue(0);
        });
    }, [missionData, speak, addMessage]);

    const handleStartRoleplay = useCallback(() => {
        if(!missionData) return;
        setStep(Step.BASIC_ROLEPLAY_START);
        setCurrentRoleplayTurn(0);
        addMessage('system', 'Role-play started. It is the tutor\'s turn to speak.');
        speak(missionData.exampleDialogue[0].sentence, () => {
            setStep(Step.BASIC_ROLEPLAY_IN_PROGRESS);
        });
        addMessage('gina', missionData.exampleDialogue[0].sentence);
    }, [missionData, speak, addMessage]);

    const handleUserSpeech = useCallback((transcript: string) => {
        if (!missionData || (step !== Step.BASIC_ROLEPLAY_IN_PROGRESS && step !== Step.ADVANCED_ROLEPLAY_IN_PROGRESS)) return;
        
        addMessage('user', transcript);

        const isBasic = step === Step.BASIC_ROLEPLAY_IN_PROGRESS;
        const dialogue = isBasic ? missionData.exampleDialogue : advancedDialogue!.advancedDialogue;
        const nextTurnIndex = currentRoleplayTurn + 2;

        if (isBasic) {
            setUserRoleplayTranscript(prev => [...prev, transcript]);
        } else {
            setUserAdvancedRoleplayTranscript(prev => [...prev, transcript]);
        }

        if (nextTurnIndex >= dialogue.length) {
            // Roleplay finished
            if(isBasic) {
                 setStep(Step.FIRST_FEEDBACK_LOADING);
            } else {
                 setStep(Step.FINAL_FEEDBACK_LOADING);
            }
        } else {
            setCurrentRoleplayTurn(nextTurnIndex);
            const nextGinaSentence = dialogue[nextTurnIndex].sentence;
            addMessage('gina', nextGinaSentence);
            speak(nextGinaSentence, () => {});
        }
    }, [missionData, advancedDialogue, step, currentRoleplayTurn, addMessage, speak]);

    // Effect for fetching first feedback
    useEffect(() => {
        if(step !== Step.FIRST_FEEDBACK_LOADING || !missionData) return;
        const fetchFeedback = async () => {
            try {
                addMessage('system', undefined, <LoadingSpinner />);
                const data = await GeminiService.generateFirstFeedback(settings, userRoleplayTranscript);
                setFirstFeedback(data);
                addMessage('gina', data.praise, <FirstFeedbackCard feedback={data} />);
                setStep(Step.FIRST_FEEDBACK_AWAIT_USER);
            } catch(error) {
                handleError(error);
            }
        };
        fetchFeedback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, missionData, userRoleplayTranscript, addMessage, settings]);
    
    const handleAdvancedChallengeAccept = useCallback(() => {
        if(!missionData) return;
        setStep(Step.ADVANCED_ROLEPLAY_DEMO);
        addMessage('gina', "좋아요! 그럼 제가 먼저 응용 상황을 보여드릴게요.");
        speak("Great! I'll show you the advanced scenario first.", async () => {
            try {
                addMessage('system', undefined, <LoadingSpinner />);
                const data = await GeminiService.generateAdvancedDialogue(settings, missionData);
                setAdvancedDialogue(data);
                
                const playDialogue = (index: number) => {
                    if (index >= data.advancedDialogue.length) {
                        handleStartAdvancedRoleplay(data.advancedDialogue);
                        return;
                    }
                    const turn = data.advancedDialogue[index];
                    addMessage('gina', `${turn.speaker === 'teacher' ? 'Tutor' : 'You'}: ${turn.sentence}`);
                    speak(turn.sentence, () => playDialogue(index + 1));
                };
                playDialogue(0);

            } catch (error) {
                handleError(error);
            }
        });
    }, [missionData, speak, addMessage, settings]);

    const handleStartAdvancedRoleplay = (dialogue: DialogueTurn[]) => {
        if(!dialogue || dialogue.length === 0) return;
        setStep(Step.ADVANCED_ROLEPLAY_START);
        setCurrentRoleplayTurn(0);
        addMessage('system', 'Advanced role-play started. It is the tutor\'s turn to speak.');
        speak(dialogue[0].sentence, () => {
            setStep(Step.ADVANCED_ROLEPLAY_IN_PROGRESS);
        });
        addMessage('gina', dialogue[0].sentence);
    };

    // Effect for fetching final feedback
    useEffect(() => {
        if(step !== Step.FINAL_FEEDBACK_LOADING || !missionData) return;
        const fetchFeedback = async () => {
            try {
                addMessage('system', undefined, <LoadingSpinner />);
                const data = await GeminiService.generateFinalFeedback(settings, missionData, userRoleplayTranscript, userAdvancedRoleplayTranscript);
                setFinalFeedback(data);
                addMessage('gina', undefined, <FinalFeedbackCard feedback={data} />);
                addMessage('gina', "마지막으로 따라 말하기 연습을 해볼까요?");
                speak("Lastly, shall we practice shadowing?", () => {
                    setStep(Step.SHADOWING_AWAIT_USER);
                });
            } catch(error) {
                handleError(error);
            }
        };
        fetchFeedback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, missionData, userRoleplayTranscript, userAdvancedRoleplayTranscript, addMessage, speak, settings]);

    const handleStartShadowing = useCallback(() => {
        if(!missionData) return;
        setStep(Step.SHADOWING_IN_PROGRESS);
        setCurrentShadowingIndex(0);
        addMessage('gina', '좋습니다! 그럼 총 3문장을 따라 말해 볼게요. 제가 먼저 읽으면, 듣고 따라 말씀해주세요.');
        speak('Great! Let\'s practice 3 sentences. I\'ll read it first, then you repeat after me.', () => {
            const firstSentence = missionData.keyExpressions[0].english;
            addMessage('gina', `첫 번째 문장입니다: "${firstSentence}"`);
            speak(`First sentence: ${firstSentence}`);
        });
    }, [missionData, speak, addMessage]);

    const handleShadowingSpeech = useCallback((transcript: string) => {
        if(!missionData || step !== Step.SHADOWING_IN_PROGRESS) return;

        addMessage('user', transcript);

        const nextIndex = currentShadowingIndex + 1;
        const sentences = missionData.keyExpressions.slice(0, 3);

        if(nextIndex < sentences.length) {
            setCurrentShadowingIndex(nextIndex);
            const praise = ["네, 아주 좋아요!", "훌륭해요!"];
            const nextSentence = sentences[nextIndex].english;
            const ginaMessage = `${praise[nextIndex-1]} 다음 문장입니다: "${nextSentence}"`
            addMessage('gina', ginaMessage);
            speak(praise[nextIndex-1] + ` Next sentence is: ${nextSentence}`);
        } else {
            addMessage('gina', '완벽해요! 모든 문장을 다 익히셨네요.');
            speak('Perfect! You have mastered all the sentences.', () => {
                addMessage('gina', '오늘 정말 수고 많으셨어요! 이어서 새로운 시나리오에 도전하시겠어요, 아니면 오늘은 여기까지 할까요?');
                speak('You worked hard today! Would you like to try a new scenario or shall we stop here for today?', () => {
                    setStep(Step.SESSION_COMPLETE_AWAIT_USER);
                });
            });
        }
    }, [missionData, step, currentShadowingIndex, addMessage, speak]);

    const handleSkip = useCallback(() => {
        if (step === Step.BASIC_ROLEPLAY_IN_PROGRESS || step === Step.ADVANCED_ROLEPLAY_IN_PROGRESS) {
            handleUserSpeech('(건너뜀)');
        } else if (step === Step.SHADOWING_IN_PROGRESS) {
            handleShadowingSpeech('(건너뜀)');
        }
    }, [step, handleUserSpeech, handleShadowingSpeech]);

    const handleSessionEnd = () => {
        setStep(Step.SESSION_ENDED);
        addMessage('gina', '네, 알겠습니다. 오늘 함께해서 즐거웠어요! 다음에 또 만나요!');
        speak('Okay. It was fun learning with you today! See you next time!');
    };

    const handleDownload = useCallback(() => {
        const date = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
        const lines: string[] = [];

        lines.push(`# Gina AI English Tutor — 학습 기록`);
        lines.push(`> 날짜: ${date}`);
        lines.push('');

        // Mission
        if (missionData) {
            lines.push(`## 미션`);
            lines.push(`**${missionData.missionTitle}**`);
            lines.push(`${missionData.scenario}`);
            lines.push('');

            lines.push(`### 핵심 표현`);
            missionData.keyExpressions.forEach(e => {
                lines.push(`- **${e.english}** — ${e.korean}`);
            });
            lines.push('');

            lines.push(`### 예시 대화`);
            missionData.exampleDialogue.forEach(d => {
                lines.push(`- ${d.speaker === 'teacher' ? 'Tutor' : 'You'}: ${d.sentence}`);
            });
            lines.push('');

            lines.push(`### 오늘의 팁`);
            lines.push(`> ${missionData.tip}`);
            lines.push('');
        }

        // Conversation log (text only)
        const textMessages = messages.filter(m => m.text && m.text !== '(건너뜀)');
        if (textMessages.length > 0) {
            lines.push(`## 대화 기록`);
            textMessages.forEach(m => {
                const sender = m.sender === 'gina' ? 'Gina' : m.sender === 'user' ? '나' : '시스템';
                lines.push(`**[${sender}]** ${m.text}`);
            });
            lines.push('');
        }

        // First feedback
        if (firstFeedback) {
            lines.push(`## 1차 피드백`);
            lines.push(firstFeedback.praise);
            lines.push('');
            lines.push(`### 새로운 표현`);
            firstFeedback.newExpressions.forEach(e => {
                lines.push(`- **${e.english}** — ${e.korean}`);
            });
            lines.push('');
        }

        // Final feedback
        if (finalFeedback) {
            lines.push(`## 최종 피드백`);
            lines.push(finalFeedback.finalPraise);
            lines.push('');
            lines.push(`**잘한 점:** ${finalFeedback.goodPoints}`);
            lines.push('');

            if (finalFeedback.corrections.length > 0) {
                lines.push(`### 교정 제안`);
                finalFeedback.corrections.forEach(c => {
                    lines.push(`- 내가 한 말: "${c.userSentence}"`);
                    lines.push(`  더 자연스러운 표현: "${c.recommendedSentence}"`);
                    lines.push(`  이유: ${c.reason}`);
                });
                lines.push('');
            }

            if (finalFeedback.additionalVocab.length > 0) {
                lines.push(`### 추가 어휘`);
                finalFeedback.additionalVocab.forEach(v => {
                    lines.push(`- **${v.english}** — ${v.korean}`);
                });
                lines.push('');
            }

            lines.push(`### 오늘의 문장`);
            lines.push(`> "${finalFeedback.sentenceToMemorize}"`);
        }

        const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gina-학습기록-${date}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }, [missionData, messages, firstFeedback, finalFeedback]);

    // Card Components defined inside App to have access to state and handlers
    const MissionCard = ({ mission }: { mission: MissionData }) => (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-2xl font-bold text-blue-600 mb-2">{mission?.missionTitle || 'Loading Mission...'}</h2>
            <p className="text-gray-600 mb-4">{mission?.scenario || ''}</p>
            <div className="mb-4">
                <h3 className="font-semibold text-lg text-gray-800 mb-2">Key Expressions</h3>
                <ul className="space-y-1 list-disc list-inside">
                    {(mission?.keyExpressions || []).map((exp, i) => <li key={i}><span className="font-medium text-gray-700">{exp?.english}</span>: {exp?.korean}</li>)}
                </ul>
            </div>
             <div className="mb-4">
                <h3 className="font-semibold text-lg text-gray-800 mb-2">Example Dialogue</h3>
                <div className="space-y-2 text-sm bg-gray-50 p-3 rounded-md">
                    {(mission?.exampleDialogue || []).map((d, i) => <p key={i}><span className={`font-bold ${d?.speaker === 'teacher' ? 'text-blue-500' : 'text-green-500'}`}>{d?.speaker === 'teacher' ? 'Tutor' : 'You'}:</span> {d?.sentence}</p>)}
                </div>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r-lg">
                <h4 className="font-semibold text-blue-800">Today's Tip!</h4>
                <p className="text-blue-700">{mission?.tip || ''}</p>
            </div>
        </div>
    );
    
    const FirstFeedbackCard = ({ feedback }: { feedback: FirstFeedbackData }) => (
        <div className="bg-white p-4 rounded-lg shadow-sm">
            <p className="mb-3">{feedback?.praise || ''}</p>
            <h4 className="font-semibold text-gray-800 mb-2">Try these new expressions!</h4>
            <ul className="space-y-1">
                {(feedback?.newExpressions || []).map((exp, i) => <li key={i}><span className="font-medium text-indigo-600">{exp?.english}</span>: {exp?.korean}</li>)}
            </ul>
        </div>
    );

    const FinalFeedbackCard = ({ feedback }: { feedback: FinalFeedbackData }) => (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <p className="text-lg text-gray-800 mb-4">{feedback.finalPraise}</p>
            <div className="border-t pt-4">
                <h3 className="text-xl font-bold text-green-600 mb-3 flex items-center"><CheckIcon className="h-6 w-6 mr-2" />Review & Level Up!</h3>
                <div className="space-y-4">
                    <div>
                        <h4 className="font-semibold text-gray-700">What you did well:</h4>
                        <p className="text-gray-600 pl-4">{feedback.goodPoints}</p>
                    </div>
                    {feedback.corrections.length > 0 && <div>
                        <h4 className="font-semibold text-gray-700">Correction suggestions:</h4>
                        <ul className="space-y-2 pl-4">
                        {feedback.corrections.map((c, i) => (
                            <li key={i} className="bg-orange-50 p-2 rounded-md">
                                <p className="text-sm text-red-600">You said: "{c.userSentence}"</p>
                                <p className="text-sm text-green-700">Try: "{c.recommendedSentence}"</p>
                                <p className="text-xs text-gray-500 mt-1">Reason: {c.reason}</p>
                            </li>
                        ))}
                        </ul>
                    </div>}
                     <div>
                        <h4 className="font-semibold text-gray-700">Additional Vocabulary:</h4>
                        <ul className="list-disc list-inside pl-4 text-gray-600">
                            {feedback.additionalVocab.map((v, i) => <li key={i}><span className="font-medium text-gray-800">{v.english}</span>: {v.korean}</li>)}
                        </ul>
                    </div>
                     <div>
                        <h4 className="font-semibold text-gray-700">Sentence to Memorize:</h4>
                        <p className="text-indigo-600 font-medium bg-indigo-50 p-2 rounded-md pl-4">"{feedback.sentenceToMemorize}"</p>
                    </div>
                </div>
            </div>
        </div>
    );
    

    const renderFooter = () => {
        if (isSpeaking) {
            return <div className="text-center text-gray-500 italic">Gina is speaking...</div>;
        }
        
        switch (step) {
            case Step.INITIAL_LOADING:
                return <LoadingSpinner />;
            case Step.MISSION_PRESENTATION:
                return <button onClick={handleStartDemo} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors"><PlayIcon className="h-6 w-6 mr-2"/> Start AI Demo</button>;
            case Step.AI_DEMO_AWAIT_USER:
                return <button onClick={handleStartRoleplay} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">I'm Ready!</button>;
            case Step.BASIC_ROLEPLAY_IN_PROGRESS:
            case Step.ADVANCED_ROLEPLAY_IN_PROGRESS:
                return (
                    <div className="flex flex-col items-center gap-2 w-full">
                        <button
                            onClick={() => startListening(handleUserSpeech)}
                            disabled={isListening}
                            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} text-white shadow-lg`}
                        >
                            <MicrophoneIcon className="h-10 w-10" />
                        </button>
                        <button
                            onClick={handleSkip}
                            disabled={isListening}
                            className="text-xs text-gray-400 hover:text-gray-600 py-1 px-4 rounded-full border border-gray-200 hover:border-gray-400 transition-colors disabled:opacity-30"
                        >
                            건너뛰기 →
                        </button>
                    </div>
                );
            case Step.FIRST_FEEDBACK_AWAIT_USER:
                return (
                    <div className="flex gap-4">
                        <button onClick={handleAdvancedChallengeAccept} className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">Yes, let's do it!</button>
                        <button onClick={handleSessionEnd} className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-colors">No, I'm done</button>
                    </div>
                );
            case Step.FIRST_FEEDBACK_LOADING:
            case Step.FINAL_FEEDBACK_LOADING:
                 return <div className="text-center text-gray-500 italic">Gina is preparing your feedback...</div>;
            case Step.SHADOWING_AWAIT_USER:
                 return (
                    <div className="flex gap-4">
                        <button onClick={handleStartShadowing} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">Yes, let's practice!</button>
                        <button onClick={handleSessionEnd} className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-colors">No, thanks</button>
                    </div>
                );
            case Step.SHADOWING_IN_PROGRESS:
                return (
                    <div className="flex flex-col items-center gap-2 w-full">
                        <button
                            onClick={() => startListening(handleShadowingSpeech)}
                            disabled={isListening}
                            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-indigo-500 hover:bg-indigo-600'} text-white shadow-lg`}
                        >
                            <MicrophoneIcon className="h-10 w-10" />
                        </button>
                        <button
                            onClick={handleSkip}
                            disabled={isListening}
                            className="text-xs text-gray-400 hover:text-gray-600 py-1 px-4 rounded-full border border-gray-200 hover:border-gray-400 transition-colors disabled:opacity-30"
                        >
                            건너뛰기 →
                        </button>
                    </div>
                );
            case Step.SESSION_COMPLETE_AWAIT_USER:
                return (
                    <div className="flex gap-4">
                        <button onClick={() => { setCustomScenarioInput(''); setIsScenarioModalOpen(true); }} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">새 상황 선택</button>
                        <button onClick={handleSessionEnd} className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-colors">오늘은 여기까지</button>
                    </div>
                );
            case Step.SESSION_ENDED:
                return <button onClick={() => { setCustomScenarioInput(''); setIsScenarioModalOpen(true); }} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors"><RefreshIcon className="h-6 w-6 mr-2"/> 새 학습 시작</button>;
            case Step.ERROR:
                return <button onClick={() => startNewSession()} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors"><RefreshIcon className="h-6 w-6 mr-2"/> 다시 시도</button>;
            default:
                return null;
        }
    };

    const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newProvider = e.target.value as AIProvider;
        setSettings(prev => ({ ...prev, provider: newProvider }));
        addMessage('system', `Provider switched to ${newProvider}`);
    };

    const providerLabel: Record<string, string> = {
        gemini: 'Gemini',
        ollama: 'Ollama',
        openai: 'OpenAI',
        'web-service': 'Spring API',
    };

    return (
        <div className="flex flex-col h-screen bg-gray-100 max-w-3xl mx-auto shadow-2xl relative overflow-hidden">
            {/* Header */}
            <header className="bg-white shadow-md px-4 py-3 flex items-center justify-between z-10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">G</div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 leading-tight">Gina AI Tutor</h1>
                        <p className="text-xs text-gray-400 leading-tight">{providerLabel[settings.provider] || settings.provider} · {settings.providerConfigs[settings.provider]?.modelName || '-'}</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsMenuOpen(true)}
                    className="p-2 rounded-lg text-gray-500 hover:text-blue-500 hover:bg-gray-100 transition-colors"
                    aria-label="메뉴 열기"
                >
                    <HamburgerIcon className="h-6 w-6" />
                </button>
            </header>

            {/* Scenario Input Modal */}
            {isScenarioModalOpen && (() => {
                const CATEGORIES = [
                    {
                        id: '여행', label: '✈️ 여행', chips: [
                            '호텔 체크인', '공항 탑승 수속', '길 묻기', '관광지 안내 요청',
                            '호텔에서 룸서비스 주문', '렌터카 예약', '여행 짐 분실 신고',
                        ],
                    },
                    {
                        id: '음식', label: '🍽️ 음식', chips: [
                            '레스토랑 예약', '카페 주문', '음식 알레르기 설명',
                            '패스트푸드 주문', '음식 추천 요청', '테이크아웃 주문',
                        ],
                    },
                    {
                        id: '비즈니스', label: '💼 비즈니스', chips: [
                            '비즈니스 미팅', '취업 면접', '전화 회의 참여',
                            '프레젠테이션 발표', '이메일 내용 전달', '협상 및 계약',
                        ],
                    },
                    {
                        id: '생활', label: '🏠 생활', chips: [
                            '병원 예약', '쇼핑몰에서 교환', '은행 업무',
                            '약국에서 약 구매', '우체국 소포 발송', '헬스장 등록',
                        ],
                    },
                    {
                        id: '직접입력', label: '✏️ 직접 입력', chips: [],
                    },
                ];
                const activeCat = CATEGORIES.find(c => c.id === selectedCategory);
                return (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
                        <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                            {/* Modal Header */}
                            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">G</div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-800">어떤 상황을 연습할까요?</h2>
                                        <p className="text-xs text-gray-400">카테고리를 선택하거나 직접 입력하세요</p>
                                    </div>
                                </div>
                            </div>

                            {/* Category Tabs */}
                            <div className="px-4 pt-4 pb-2">
                                <div className="flex flex-wrap gap-2">
                                    {CATEGORIES.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => {
                                                setSelectedCategory(cat.id === selectedCategory ? null : cat.id);
                                                if (cat.id !== '직접입력') setCustomScenarioInput('');
                                            }}
                                            className={`flex-shrink-0 text-xs px-3 py-2 rounded-full font-semibold border transition-all ${
                                                selectedCategory === cat.id
                                                    ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                                            }`}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Chips or Input Area */}
                            <div className="px-6 py-3 overflow-y-auto no-scrollbar" style={{maxHeight: '38vh', minHeight: '80px', scrollbarWidth: 'none', msOverflowStyle: 'none'} as React.CSSProperties}>
                                {!selectedCategory && (
                                    <p className="text-sm text-gray-400 text-center mt-6">위에서 카테고리를 선택하거나<br />직접 입력 탭을 눌러 시작하세요</p>
                                )}
                                {activeCat && activeCat.id !== '직접입력' && (
                                    <div className="flex flex-wrap gap-2">
                                        {activeCat.chips.map(chip => (
                                            <button
                                                key={chip}
                                                onClick={() => setCustomScenarioInput(chip)}
                                                className={`text-sm px-3 py-2 rounded-xl border transition-colors ${
                                                    customScenarioInput === chip
                                                        ? 'bg-blue-500 text-white border-blue-500'
                                                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                                                }`}
                                            >
                                                {chip}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {activeCat && activeCat.id === '직접입력' && (
                                    <textarea
                                        autoFocus
                                        value={customScenarioInput}
                                        onChange={e => setCustomScenarioInput(e.target.value)}
                                        placeholder="예: 미국 출장 중 동료와 점심 메뉴 정하기, 해외 은행에서 계좌 개설하기..."
                                        rows={4}
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-gray-50"
                                    />
                                )}
                                {/* Show selected scenario preview */}
                                {customScenarioInput.trim() && activeCat?.id !== '직접입력' && (
                                    <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                                        <span className="text-blue-500 text-xs font-semibold">선택됨</span>
                                        <span className="text-blue-700 text-sm flex-1">{customScenarioInput}</span>
                                        <button onClick={() => setCustomScenarioInput('')} className="text-blue-400 hover:text-blue-600 text-xs">✕</button>
                                    </div>
                                )}
                            </div>

                            {/* Buttons */}
                            <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-gray-100">
                                <button
                                    onClick={() => { setIsScenarioModalOpen(false); setSelectedCategory(null); startNewSession(); }}
                                    className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors"
                                >
                                    랜덤으로 시작
                                </button>
                                <button
                                    onClick={() => { setIsScenarioModalOpen(false); setSelectedCategory(null); startNewSession(customScenarioInput.trim() || undefined); }}
                                    className="flex-1 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold transition-colors"
                                >
                                    {customScenarioInput.trim() ? '이 상황으로 시작' : '시작하기'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Backdrop */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-40 transition-opacity"
                    onClick={() => setIsMenuOpen(false)}
                />
            )}

            {/* Slide-in Drawer */}
            <div className={`fixed top-0 right-0 h-full w-72 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h2 className="font-bold text-gray-800">메뉴</h2>
                    <button
                        onClick={() => setIsMenuOpen(false)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        <XIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Drawer Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {/* New Session */}
                    <button
                        onClick={() => { setIsMenuOpen(false); setCustomScenarioInput(''); setSelectedCategory(null); setIsScenarioModalOpen(true); }}
                        className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                    >
                        <RefreshIcon className="h-5 w-5" />
                        새 학습 시작
                    </button>

                    <button
                        onClick={() => { setIsMenuOpen(false); handleDownload(); }}
                        disabled={!missionData}
                        className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <DownloadIcon className="h-5 w-5" />
                        학습 내용 다운로드
                    </button>

                    <hr className="border-gray-100" />

                    {/* AI Provider */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI 제공자</label>
                        <select
                            value={settings.provider}
                            onChange={handleProviderChange}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                            <option value="gemini">Gemini</option>
                            <option value="ollama">Ollama</option>
                            <option value="openai">OpenAI</option>
                            <option value="web-service">Spring API</option>
                        </select>
                    </div>

                    {/* Model Name */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">모델</label>
                        {settings.provider === 'ollama' && availableOllamaModels.length > 0 ? (
                            <select
                                value={settings.providerConfigs.ollama?.modelName}
                                onChange={(e) => setSettings(prev => ({
                                    ...prev,
                                    providerConfigs: {
                                        ...prev.providerConfigs,
                                        ollama: { ...prev.providerConfigs.ollama, modelName: e.target.value }
                                    }
                                }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            >
                                {availableOllamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        ) : (
                            <input
                                type="text"
                                value={settings.providerConfigs[settings.provider]?.modelName || ''}
                                onChange={(e) => setSettings(prev => ({
                                    ...prev,
                                    providerConfigs: {
                                        ...prev.providerConfigs,
                                        [prev.provider]: { ...prev.providerConfigs[prev.provider], modelName: e.target.value }
                                    }
                                }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                placeholder="모델명 입력"
                            />
                        )}
                    </div>

                    {/* Base URL */}
                    {settings.provider !== 'gemini' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Base URL</label>
                            <input
                                type="text"
                                value={settings.providerConfigs[settings.provider]?.baseUrl || ''}
                                onChange={(e) => setSettings(prev => ({
                                    ...prev,
                                    providerConfigs: {
                                        ...prev.providerConfigs,
                                        [prev.provider]: { ...prev.providerConfigs[prev.provider], baseUrl: e.target.value }
                                    }
                                }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                placeholder="http://..."
                            />
                        </div>
                    )}

                    {/* Gemini API Key */}
                    {settings.provider === 'gemini' && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">API Key</label>
                            <input
                                type="password"
                                value={settings.providerConfigs.gemini?.apiKey || ''}
                                onChange={(e) => setSettings(prev => ({
                                    ...prev,
                                    providerConfigs: {
                                        ...prev.providerConfigs,
                                        gemini: { ...prev.providerConfigs.gemini, apiKey: e.target.value }
                                    }
                                }))}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                placeholder="API Key"
                            />
                        </div>
                    )}

                    {/* Temperature */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            창의성 (Temperature: {settings.temperature})
                        </label>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            value={settings.temperature}
                            onChange={(e) => setSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                            className="w-full accent-blue-500"
                        />
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                            <span>정확</span>
                            <span>창의적</span>
                        </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Voice Selection */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                            지나 목소리 (영어)
                        </label>
                        {englishVoices.length === 0 ? (
                            <p className="text-xs text-gray-400">브라우저에서 목소리를 불러오는 중...</p>
                        ) : (
                            <select
                                value={selectedVoiceName}
                                onChange={(e) => handleVoiceChange(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            >
                                <option value="">기본 목소리</option>
                                {englishVoices.map(v => (
                                    <option key={v.name} value={v.name}>
                                        {v.name} ({v.lang})
                                    </option>
                                ))}
                            </select>
                        )}
                        {selectedVoiceName && (
                            <button
                                onClick={() => {
                                    speak(`Hello! I'm Gina, your English tutor. Nice to meet you!`);
                                }}
                                className="mt-2 w-full text-xs text-blue-500 hover:text-blue-700 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                                미리 듣기
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(msg => <ChatMessageBubble key={msg.id} message={msg} />)}
                <div ref={chatEndRef} />
            </main>
            <footer className="bg-white/80 backdrop-blur-sm p-4 border-t border-gray-200 flex justify-center items-center">
                {renderFooter()}
            </footer>
        </div>
    );
};


const ChatMessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const isGina = message.sender === 'gina';
    const isUser = message.sender === 'user';
    const isSystem = message.sender === 'system';

    if (isSystem) {
        return (
            <div className="my-2">
                {message.text ? (
                    <p className="text-center text-xs text-gray-500 italic p-2 bg-gray-200 rounded-full w-fit mx-auto px-4">
                        {message.text}
                    </p>
                ) : message.component}
            </div>
        );
    }

    // 건너뜀 메시지는 말풍선 대신 작은 안내 텍스트로 표시
    if (isUser && message.text === '(건너뜀)') {
        return (
            <div className="flex justify-end">
                <span className="text-xs text-gray-300 italic pr-1">건너뜀</span>
            </div>
        );
    }

    return (
        <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {isGina && <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">G</div>}
            <div className={`max-w-md lg:max-w-lg p-3 rounded-2xl ${isUser ? 'bg-blue-500 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none shadow-sm'}`}>
                {message.text && <p>{message.text}</p>}
                {message.component}
            </div>
             {isUser && <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">U</div>}
        </div>
    );
};

export default App;
