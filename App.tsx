
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Step, type ChatMessage, type MissionData, type DialogueTurn, type FirstFeedbackData, type FinalFeedbackData, type AdvancedDialogueData, KeyExpression, type GenerationSettings, type AIProvider } from './types';
import { GeminiService, DEFAULT_SETTINGS, getOllamaModels } from './services/geminiService';
import { useSpeech } from './hooks/useSpeech';
import LoadingSpinner from './components/LoadingSpinner';
import { MicrophoneIcon, PlayIcon, RefreshIcon, CheckIcon, HamburgerIcon, XIcon } from './components/Icons';

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
    
    const { isListening, isSpeaking, speak, startListening, stopListening, cancelSpeech } = useSpeech();
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

    const startNewSession = useCallback(async () => {
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
        cancelSpeech();

        try {
            const data = await GeminiService.generateInitialMission(settings, missionData?.missionTitle);
            setMissionData(data);
            setStep(Step.MISSION_PRESENTATION);
        } catch (error) {
            handleError(error);
        }
    }, [missionData?.missionTitle, addMessage, cancelSpeech, settings]);

    useEffect(() => {
        startNewSession();
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

    const handleSessionEnd = () => {
        setStep(Step.SESSION_ENDED);
        addMessage('gina', '네, 알겠습니다. 오늘 함께해서 즐거웠어요! 다음에 또 만나요!');
        speak('Okay. It was fun learning with you today! See you next time!');
    };

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
                return <button onClick={() => startListening(handleUserSpeech)} disabled={isListening} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} text-white`}>
                    <MicrophoneIcon className="h-10 w-10" />
                </button>;
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
                return <button onClick={() => startListening(handleShadowingSpeech)} disabled={isListening} className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-red-500 animate-pulse' : 'bg-blue-500 hover:bg-blue-600'} text-white`}>
                    <MicrophoneIcon className="h-10 w-10" />
                </button>;
            case Step.SESSION_COMPLETE_AWAIT_USER:
                return (
                    <div className="flex gap-4">
                        <button onClick={startNewSession} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition-colors">New Scenario</button>
                        <button onClick={handleSessionEnd} className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-colors">End Session</button>
                    </div>
                );
            case Step.SESSION_ENDED:
                return <button onClick={startNewSession} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors"><RefreshIcon className="h-6 w-6 mr-2"/> Start a New Session</button>;
            case Step.ERROR:
                return <button onClick={startNewSession} className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors"><RefreshIcon className="h-6 w-6 mr-2"/> Try Again</button>;
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
                        onClick={() => { setIsMenuOpen(false); startNewSession(); }}
                        className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                    >
                        <RefreshIcon className="h-5 w-5" />
                        새 학습 시작
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
