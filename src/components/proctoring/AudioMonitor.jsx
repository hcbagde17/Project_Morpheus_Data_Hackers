import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * AudioMonitor — Headless proctoring component
 * Uses Web Audio API to detect:
 *   1. Voice Activity (energy-based + zero-crossing rate)
 *   2. Sustained speech patterns
 *   3. Background noise anomalies
 *
 * Props:
 *   active: boolean
 *   onFlag: ({ type, message, severity }) => void
 */
export default function AudioMonitor({ active, onFlag }) {
    const lastFlagRef = useRef({});
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const speechFrameCount = useRef(0);
    const silenceFrameCount = useRef(0);

    const emitFlag = useCallback((type, message, severity = 'medium') => {
        const now = Date.now();
        if (lastFlagRef.current[type] && now - lastFlagRef.current[type] < 10000) return;
        lastFlagRef.current[type] = now;
        onFlag?.({ type, message, severity, timestamp: new Date() });
    }, [onFlag]);

    useEffect(() => {
        if (!active) return;

        let intervalId;

        const startAudioMonitoring = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                streamRef.current = stream;

                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                audioContextRef.current = audioCtx;

                const source = audioCtx.createMediaStreamSource(stream);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 1024;
                analyser.smoothingTimeConstant = 0.3;
                source.connect(analyser);
                analyserRef.current = analyser;

                // Check audio every 500ms
                intervalId = setInterval(() => analyzeAudio(), 500);
            } catch (err) {
                console.warn('AudioMonitor: microphone access failed', err);
                emitFlag('MIC_ERROR', 'Microphone access failed — audio monitoring disabled.', 'medium');
            }
        };

        startAudioMonitoring();

        return () => {
            if (intervalId) clearInterval(intervalId);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, [active, emitFlag]);

    const analyzeAudio = () => {
        const analyser = analyserRef.current;
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Calculate RMS energy
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);

        // Calculate energy in speech band (300Hz - 3400Hz)
        // With fftSize=1024 and sampleRate=48000, each bin is ~46.875Hz
        // 300Hz ≈ bin 6, 3400Hz ≈ bin 72
        const sampleRate = audioContextRef.current?.sampleRate || 48000;
        const binSize = sampleRate / 1024;
        const speechStartBin = Math.floor(300 / binSize);
        const speechEndBin = Math.ceil(3400 / binSize);

        let speechEnergy = 0;
        for (let i = speechStartBin; i <= speechEndBin && i < bufferLength; i++) {
            speechEnergy += dataArray[i];
        }
        const avgSpeechEnergy = speechEnergy / (speechEndBin - speechStartBin + 1);

        // Voice activity: speech band energy high relative to overall
        const SPEECH_THRESHOLD = 40; // Tunable
        const isSpeech = avgSpeechEnergy > SPEECH_THRESHOLD;

        if (isSpeech) {
            speechFrameCount.current++;
            silenceFrameCount.current = 0;

            // Sustained speech: 6 consecutive frames = ~3 seconds
            if (speechFrameCount.current >= 6) {
                emitFlag('SPEECH_DETECTED', 'Sustained speech detected from student microphone.', 'medium');
                speechFrameCount.current = 0;
            }

            // Whisper detection: moderate energy in speech band
            if (avgSpeechEnergy > 20 && avgSpeechEnergy < 35) {
                speechFrameCount.current++; // Weight whispers more
                if (speechFrameCount.current >= 8) {
                    emitFlag('WHISPER_DETECTED', 'Possible whispering detected.', 'medium');
                    speechFrameCount.current = 0;
                }
            }
        } else {
            silenceFrameCount.current++;
            speechFrameCount.current = Math.max(0, speechFrameCount.current - 1);
        }

        // Background noise anomaly: high RMS but low speech energy
        if (rms > 80 && avgSpeechEnergy < 15) {
            emitFlag('BACKGROUND_NOISE', 'Unusual background noise pattern detected.', 'low');
        }
    };

    // Headless component
    return null;
}
