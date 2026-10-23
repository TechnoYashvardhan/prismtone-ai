import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Speech helpers built on the browser Web Speech API (no extra dependencies).
 * - useSpeechInput: dictate a draft through the microphone (Chrome / Edge).
 * - useSpeaker: read a rewrite aloud with persona-tuned rate and pitch.
 */

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export function useSpeechInput({ lang = 'en-IN', onFinalText }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onFinalRef = useRef(onFinalText);
  onFinalRef.current = onFinalText;

  const supported = Boolean(SpeechRecognitionImpl);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError('Voice input needs Chrome or Edge.');
      return;
    }
    setError(null);
    const recognition = new SpeechRecognitionImpl();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) onFinalRef.current?.(result[0].transcript.trim());
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') setError('Microphone permission was denied.');
      else if (event.error !== 'no-speech' && event.error !== 'aborted') setError(`Voice input error: ${event.error}`);
    };
    recognition.onend = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [lang, supported]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, interim, error, start, stop };
}

// Delivery style per persona: brisk executive, warm peer, measured legal, upbeat Gen-Z.
const VOICE_STYLE = {
  executive: { rate: 1.05, pitch: 0.9 },
  peer: { rate: 1.0, pitch: 1.1 },
  legal: { rate: 0.9, pitch: 0.85 },
  gen_z: { rate: 1.15, pitch: 1.25 },
};

const DEVANAGARI_RE = /[\u0900-\u097F]/;

function pickVoice(lang) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || !voices.length) return null;

  const targetLang = (lang || 'en-IN').toLowerCase();
  const prefix = targetLang.split('-')[0];

  // Prefer high-quality natural/Google/Microsoft voices matching exact locale first
  const exactMatches = voices.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-') === targetLang);
  if (exactMatches.length) {
    return exactMatches.find((v) => /google|natural|microsoft/i.test(v.name)) || exactMatches[0];
  }

  // Fallback to language prefix match (e.g. 'hi' or 'en')
  const prefixMatches = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(prefix));
  if (prefixMatches.length) {
    return prefixMatches.find((v) => /google|natural|microsoft/i.test(v.name)) || prefixMatches[0];
  }

  return voices[0] || null;
}

export function useSpeaker() {
  const [speakingId, setSpeakingId] = useState(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Pre-load voices on mount so first click picks the right Hindi/English voice
  useEffect(() => {
    if (!supported) return undefined;
    window.speechSynthesis.getVoices();
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    }
    window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    return undefined;
  }, [supported]);

  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback((id, text, { personaId, lang = 'en-IN' } = {}) => {
    if (!supported || !text) return;
    window.speechSynthesis.cancel();

    // Auto-detect Devanagari script so Hindi rewrites always use a Hindi voice
    const effectiveLang = DEVANAGARI_RE.test(text) ? 'hi-IN' : lang;

    const utterance = new SpeechSynthesisUtterance(text);
    const style = VOICE_STYLE[personaId] || { rate: 1, pitch: 1 };
    utterance.rate = style.rate;
    utterance.pitch = style.pitch;
    utterance.lang = effectiveLang;

    const voice = pickVoice(effectiveLang);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('Speech synthesis error:', e);
      }
      setSpeakingId(null);
    };

    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }, [supported]);

  const toggle = useCallback((id, text, opts = {}) => {
    if (speakingId === id) {
      stop();
    } else {
      speak(id, text, opts);
    }
  }, [speakingId, stop, speak]);

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speakingId, speak, stop, toggle };
}
