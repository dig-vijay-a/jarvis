import { useState, useEffect, useRef, useCallback } from 'react';

// Web Audio API High-tech HUD sound generator (no external audio files needed)
export const playHudBeep = (type = 'chime') => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    if (type === 'activate') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (type === 'confirm') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'error') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(130, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    // Ignore audio context autoplay restrictions
  }
};

export const useVoiceAssistant = ({ onCommandReceived, settings = {} }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [permissionError, setPermissionError] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Bilingual Support (English & Tamil)
  const [language, setLanguage] = useState(settings.system_language === 'ta-IN' ? 'ta-IN' : 'en-US');

  // Privacy & Wake-Word Controls
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(settings.wake_word_enabled !== 'false');
  const [wakeWordPhrase, setWakeWordPhrase] = useState(settings.wake_word_phrase || 'Jarvis');
  const [wakeWordDetected, setWakeWordDetected] = useState(false);

  // References to preserve state across render cycles
  const onCommandReceivedRef = useRef(onCommandReceived);
  const isContinuousActiveRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isMicMutedRef = useRef(false);
  const isSessionRunningRef = useRef(false);
  const isStartingRef = useRef(false);
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const wakeWordPhraseRef = useRef(wakeWordPhrase);
  const languageRef = useRef(language);
  const wakeWordActiveUntilRef = useRef(0);
  const lastSpokenTextRef = useRef('');

  const recognitionRef = useRef(null);
  const restartTimerRef = useRef(null);
  const wakeWordTimeoutRef = useRef(null);
  const ttsWatchdogRef = useRef(null);
  const ttsKeepAliveIntervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioSimIntervalRef = useRef(null);

  // Keep callback and settings refs in sync
  useEffect(() => {
    onCommandReceivedRef.current = onCommandReceived;
  }, [onCommandReceived]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    wakeWordEnabledRef.current = wakeWordEnabled;
  }, [wakeWordEnabled]);

  useEffect(() => {
    wakeWordPhraseRef.current = wakeWordPhrase;
  }, [wakeWordPhrase]);

  useEffect(() => {
    languageRef.current = language;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }
  }, [language]);

  // Toggle between English and Tamil
  const toggleLanguage = useCallback(() => {
    setLanguage(prev => (prev === 'en-US' ? 'ta-IN' : 'en-US'));
  }, []);

  // Real Web Audio API analyser setup
  const requestMicPermission = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermissionError('Audio devices are not supported in this browser. Please use Chrome, Edge or Brave.');
      return false;
    }

    try {
      if (!mediaStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            const audioCtx = new AudioCtx();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateAudioLevel = () => {
              if (isMicMutedRef.current) {
                setAudioLevel(0);
                return;
              }
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i];
              }
              const avg = sum / dataArray.length;
              const normalized = Math.min(1.0, Math.max(0, avg / 128));
              setAudioLevel(normalized);
              animFrameRef.current = requestAnimationFrame(updateAudioLevel);
            };
            updateAudioLevel();
          }
        } catch (audioErr) {
          console.warn('[VoiceAssistant] AudioContext analyser notice:', audioErr);
        }
      }

      setPermissionError(null);
      return true;
    } catch (err) {
      console.warn('[VoiceAssistant] getUserMedia permission error:', err);
      let msg = 'Microphone permission denied. Please allow microphone access in your browser.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Microphone blocked by browser. Click the lock/tune icon in your address bar, set Microphone to "Allow", and try again.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No microphone device detected. Please connect a microphone and refresh.';
      }
      setPermissionError(msg);
      return false;
    }
  }, []);

  // Stop real audio analyser
  const stopAudioAnalyser = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    if (audioSimIntervalRef.current) {
      clearInterval(audioSimIntervalRef.current);
      audioSimIntervalRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Text-To-Speech (TTS) cancellation
  const stopSpeaking = useCallback(() => {
    clearTimeout(ttsWatchdogRef.current);
    clearInterval(ttsKeepAliveIntervalRef.current);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    window._novaUtterance = null;
    setIsSpeaking(false);
    isSpeakingRef.current = false;
  }, []);

  // Session spawner: creates a fresh, pristine SpeechRecognition instance every cycle
  const spawnRecognitionSession = useCallback((force = false) => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      setPermissionError('Speech recognition is not supported in this browser. Please use Chrome, Edge or Brave.');
      return;
    }

    if (isMicMutedRef.current || isSpeakingRef.current) {
      return;
    }

    if (!force && (isSessionRunningRef.current || isStartingRef.current)) {
      return;
    }

    isStartingRef.current = true;
    isSessionRunningRef.current = false;

    // Abort and nullify existing session if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageRef.current;

    recognition.onstart = () => {
      isSessionRunningRef.current = true;
      isStartingRef.current = false;
      if (isMicMutedRef.current || isSpeakingRef.current) {
        try { recognition.abort(); } catch (e) {}
        return;
      }

      // If active mode, reflect in state
      if (isContinuousActiveRef.current) {
        setIsListening(true);
      }
      setPermissionError(null);

      // Audio simulation fallback if analyser is not yet initialized
      if (!audioSimIntervalRef.current && !analyserRef.current && isContinuousActiveRef.current) {
        audioSimIntervalRef.current = setInterval(() => {
          setAudioLevel(0.2 + Math.random() * 0.5);
        }, 100);
      }
    };

    recognition.onresult = (event) => {
      if (isMicMutedRef.current) return;

      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }

      const clean = currentTranscript.trim();
      if (!clean) return;

      setTranscript(clean);

      // Echo prevention: Ignore microphone input completely while JARVIS is vocalizing through the speakers
      if (isSpeakingRef.current) {
        return;
      }

      const isFinal = event.results[event.results.length - 1].isFinal;
      const lower = clean.toLowerCase();

      // Check for Sleep / Standby command
      const sleepPhrases = ['go to sleep', 'stop listening', 'sleep jarvis', 'jarvis sleep', 'nova sleep', 'enter standby'];
      if (sleepPhrases.some(sp => lower.includes(sp))) {
        if (isFinal) {
          console.log('[VoiceAssistant] Sleep directive received. Entering passive wake-word standby.');
          playHudBeep('activate');
          isContinuousActiveRef.current = false;
          wakeWordActiveUntilRef.current = 0;
          setIsListening(false);
          setWakeWordDetected(false);
          setTranscript('');
          clearTimeout(wakeWordTimeoutRef.current);
          
          // Re-spawn clean passive listener
          setTimeout(() => {
            if (!isMicMutedRef.current && !isSpeakingRef.current) {
              spawnRecognitionSession(true);
            }
          }, 300);
        }
        return;
      }

      const configuredLower = (wakeWordPhraseRef.current || 'jarvis').toLowerCase();
      const wakePhrases = [
        configuredLower,
        'hey nova',
        'hey jarvis',
        'nova',
        'jarvis',
        'ok nova',
        'ok jarvis',
        'hi nova',
        'hi jarvis',
        'hello nova',
        'hello jarvis',
        'ஹே நோவா',
        'நோவா',
        'ஜார்விஸ்'
      ];

      // Check if utterance contains any wake-word (with word boundary awareness)
      const matchedPhrase = wakePhrases.find(p => {
        const regex = new RegExp(`(^|\\s|[,.:])${p}($|\\s|[,.:])`, 'i');
        return regex.test(lower);
      });

      if (matchedPhrase) {
        // Wake-word recognized! Transition to ACTIVE continuous voice mode immediately!
        isContinuousActiveRef.current = true;
        setIsListening(true);

        const phraseIdx = lower.indexOf(matchedPhrase);
        const remainder = clean.slice(phraseIdx + matchedPhrase.length).replace(/^[,.\s]+/, '').trim();

        if (remainder.length > 0) {
          // Case 1: Spoke wake-word and directive together ("Jarvis open VS Code" or "Hey Nova what's my schedule")
          if (isFinal) {
            console.log('[VoiceAssistant] Wake-word activated directive:', remainder);
            playHudBeep('confirm');
            if (onCommandReceivedRef.current) {
              onCommandReceivedRef.current(remainder);
            }
            setTranscript('');
            setWakeWordDetected(false);
            wakeWordActiveUntilRef.current = 0;
            clearTimeout(wakeWordTimeoutRef.current);

            // Cycle recognition session cleanly for subsequent continuous commands
            setTimeout(() => {
              if (!isSpeakingRef.current && !isMicMutedRef.current) {
                spawnRecognitionSession(true);
              }
            }, 300);
          }
          return;
        } else {
          // Case 2: Spoke JUST the wake-word ("Jarvis" or "Hey Nova") and paused!
          setWakeWordDetected(true);
          wakeWordActiveUntilRef.current = Date.now() + 10000;
          playHudBeep('activate');

          clearTimeout(wakeWordTimeoutRef.current);
          wakeWordTimeoutRef.current = setTimeout(() => {
            setWakeWordDetected(false);
            wakeWordActiveUntilRef.current = 0;
          }, 10000);
          return;
        }
      }

      // Case 3: Direct command while Voice Listening is active (either clicked or woke up via "Jarvis")
      // Handles continuous consecutive commands without needing to repeat the wake-word
      if (isContinuousActiveRef.current && isFinal && clean.length > 0) {
        console.log('[VoiceAssistant] Continuous voice directive dispatched:', clean);
        playHudBeep('confirm');
        if (onCommandReceivedRef.current) {
          onCommandReceivedRef.current(clean);
        }
        setTranscript('');
        setWakeWordDetected(false);
        wakeWordActiveUntilRef.current = 0;
        clearTimeout(wakeWordTimeoutRef.current);

        // Keep continuous active and cycle recognition session so next command is heard cleanly
        isContinuousActiveRef.current = true;
        setIsListening(true);
        setTimeout(() => {
          if (!isSpeakingRef.current && !isMicMutedRef.current) {
            spawnRecognitionSession(true);
          }
        }, 300);
      }
    };

    recognition.onerror = (event) => {
      isStartingRef.current = false;
      if (event.error === 'not-allowed') {
        console.warn('[VoiceAssistant] Microphone access not allowed yet');
        isSessionRunningRef.current = false;
        isContinuousActiveRef.current = false;
        setIsListening(false);
        stopAudioAnalyser();
      } else if (event.error === 'no-speech') {
        // Normal silence timeout; recognition.onend will restart loop
      } else if (event.error !== 'aborted') {
        console.warn('[VoiceAssistant] Speech recognition note:', event.error);
      }
    };

    recognition.onend = () => {
      isSessionRunningRef.current = false;
      isStartingRef.current = false;
      // CONTINUOUS PERSISTENT LISTENING LOOP:
      // Automatically restart recognition unless the mic is physically muted or NOVA is actively speaking!
      if (!isMicMutedRef.current && !isSpeakingRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (!isMicMutedRef.current && !isSpeakingRef.current) {
            spawnRecognitionSession(true);
          }
        }, 200);
      } else if (isMicMutedRef.current) {
        setIsListening(false);
        stopAudioAnalyser();
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (e) {
      isStartingRef.current = false;
      // Ignore start transitions
    }
  }, [stopAudioAnalyser, stopSpeaking]);

  // Start continuous voice listening (Activated via Tap or Wake-Word)
  const startListening = useCallback(async () => {
    stopSpeaking();
    setPermissionError(null);
    isContinuousActiveRef.current = true;
    setIsListening(true);
    playHudBeep('activate');

    await requestMicPermission();
    spawnRecognitionSession(true);
  }, [stopSpeaking, requestMicPermission, spawnRecognitionSession]);

  // Stop listening / return to passive standby
  const stopListening = useCallback(() => {
    isContinuousActiveRef.current = false;
    wakeWordActiveUntilRef.current = 0;
    clearTimeout(restartTimerRef.current);
    clearTimeout(wakeWordTimeoutRef.current);

    setIsListening(false);
    setWakeWordDetected(false);
    setTranscript('');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
    }
    stopAudioAnalyser();
  }, [stopAudioAnalyser]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening || isContinuousActiveRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Privacy Mute
  const toggleMicMute = useCallback(() => {
    setIsMicMuted(prev => {
      const next = !prev;
      isMicMutedRef.current = next;
      if (next) {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (e) {}
        }
        setIsListening(false);
        stopAudioAnalyser();
      } else {
        spawnRecognitionSession();
      }
      return next;
    });
  }, [stopAudioAnalyser, spawnRecognitionSession]);

  // Text-To-Speech (TTS) with GC Retention & Watchdog Protection
  const speak = useCallback((text, onEndCallback) => {
    if (!('speechSynthesis' in window)) return;

    clearTimeout(ttsWatchdogRef.current);
    clearInterval(ttsKeepAliveIntervalRef.current);
    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/[\*\_`#]/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\{.*?\}/g, '')
      .replace(/https?:\/\/[^\s]+/g, 'link')
      .trim();

    if (!cleanText) return;

    lastSpokenTextRef.current = cleanText.toLowerCase();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    // Explicitly anchor on window to prevent Chrome V8 Garbage Collection bug
    window._novaUtterance = utterance;

    utterance.rate = parseFloat(settings.tts_rate || '1.05');
    utterance.pitch = parseFloat(settings.tts_pitch || '1.0');

    const voices = window.speechSynthesis.getVoices();
    let preferredVoice = null;

    if (languageRef.current === 'ta-IN') {
      preferredVoice = voices.find(v => v.lang.startsWith('ta') || v.name.toLowerCase().includes('tamil')) ||
                       voices.find(v => v.lang.includes('IN'));
      utterance.lang = 'ta-IN';
    } else {
      preferredVoice = voices.find(v => 
        v.name.includes('Natural') || 
        v.name.includes('George') || 
        v.name.includes('UK English Male') || 
        (v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
      ) || voices.find(v => v.lang.startsWith('en'));
      utterance.lang = 'en-US';
    }

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    const finishSpeaking = () => {
      clearTimeout(ttsWatchdogRef.current);
      clearInterval(ttsKeepAliveIntervalRef.current);
      window._novaUtterance = null;
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      lastSpokenTextRef.current = '';
      if (onEndCallback) onEndCallback();

      // Ensure recognition resumes immediately and keeps continuous listening active
      if (!isMicMutedRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (!isMicMutedRef.current && !isSpeakingRef.current) {
            spawnRecognitionSession(true);
          }
        }, 200);
      }
    };

    utterance.onstart = () => {
      setIsSpeaking(true);
      isSpeakingRef.current = true;
      // Stop recognition while NOVA is vocalizing so speakers don't echo into mic
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      isSessionRunningRef.current = false;

      // Chrome SpeechSynthesis keepalive ping for long utterances
      ttsKeepAliveIntervalRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        } else {
          clearInterval(ttsKeepAliveIntervalRef.current);
        }
      }, 10000);

      // Safety Watchdog: force cleanup if onend drops due to browser audio stutter
      const wordCount = cleanText.split(/\s+/).length;
      const estimatedMs = Math.max(3000, Math.round((wordCount / 2.2) * 1000) + 2500);
      ttsWatchdogRef.current = setTimeout(() => {
        if (isSpeakingRef.current) {
          console.warn('[VoiceAssistant] TTS watchdog triggered after timeout. Re-enabling mic.');
          finishSpeaking();
        }
      }, estimatedMs);
    };

    utterance.onend = finishSpeaking;
    utterance.onerror = (e) => {
      console.warn('[VoiceAssistant] SpeechSynthesis error:', e);
      finishSpeaking();
    };

    window.speechSynthesis.speak(utterance);
  }, [settings, spawnRecognitionSession]);

  // Automatically start passive background wake-word listening on startup!
  useEffect(() => {
    // Attempt passive wake-word listening
    const timer = setTimeout(() => {
      if (!isMicMutedRef.current) {
        spawnRecognitionSession();
      }
    }, 400);

    // If browser requires a user gesture before microphone capture,
    // start the passive wake-word listener on first window interaction
    const handleGesture = async () => {
      if (!isMicMutedRef.current) {
        await requestMicPermission();
        spawnRecognitionSession(true);
      }
    };
    window.addEventListener('click', handleGesture, { once: true });
    window.addEventListener('keydown', handleGesture, { once: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('keydown', handleGesture);
      clearTimeout(restartTimerRef.current);
      clearTimeout(wakeWordTimeoutRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      stopAudioAnalyser();
    };
  }, [spawnRecognitionSession, stopAudioAnalyser]);

  return {
    isListening,
    isSpeaking,
    transcript,
    permissionError,
    clearPermissionError: () => setPermissionError(null),
    audioLevel,
    language,
    toggleLanguage,
    setLanguage,
    isMicMuted,
    toggleMicMute,
    wakeWordEnabled,
    setWakeWordEnabled,
    wakeWordPhrase,
    setWakeWordPhrase,
    wakeWordDetected,
    requestMicPermission,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
    playHudBeep
  };
};

export default useVoiceAssistant;
