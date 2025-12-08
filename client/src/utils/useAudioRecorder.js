import { useState, useRef, useEffect } from 'react';

export default function useAudioRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [duration, setDuration] = useState(0);
    const [audioBlob, setAudioBlob] = useState(null);
    const [waveform, setWaveform] = useState([]);
    
    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const chunksRef = useRef([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            // Setup Audio Context for Analysis (Waveform)
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64; // Low resolution for simple bars
            analyserRef.current = analyser;
            
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                setAudioBlob(blob);
                
                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
                
                if (audioContextRef.current) {
                    audioContextRef.current.close();
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            setDuration(0);

            // Timer for duration
            const startTime = Date.now();
            timerRef.current = setInterval(() => {
                setDuration(Date.now() - startTime);
            }, 100);

        } catch (err) {
            console.error("Error starting recording:", err);
            alert("Could not access microphone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            clearInterval(timerRef.current);
            
            // Generate a final waveform from the recording?
            // Actually, we usually want live feedback or post-processing.
            // For simplicity, let's create a visual waveform representation *after* recording 
            // or just use random data / simplified visualization of duration. 
            // Real-time analysis during recording to build the array is better.
        }
    };
    
    // Live waveform update
    useEffect(() => {
        let frameId;
        const updateWaveform = () => {
            if (isRecording && analyserRef.current) {
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                
                // Calculate average volume level for this frame 0-1
                const avg = dataArray.reduce((p, c) => p + c, 0) / dataArray.length / 255;
                
                setWaveform(prev => {
                    // Keep last ~50-80 samples
                    const newWave = [...prev, avg];
                    if (newWave.length > 50) return newWave.slice(newWave.length - 50);
                    return newWave;
                });
                
                frameId = requestAnimationFrame(updateWaveform);
            }
        };

        if (isRecording) {
            setWaveform([]); // Reset
            updateWaveform();
        } else {
            cancelAnimationFrame(frameId);
        }
        
        return () => cancelAnimationFrame(frameId);
    }, [isRecording]);

    const resetRecording = () => {
        setAudioBlob(null);
        setDuration(0);
        setWaveform([]);
        setIsRecording(false);
    };

    return {
        isRecording,
        duration,
        audioBlob,
        waveform,
        startRecording,
        stopRecording,
        resetRecording
    };
}
