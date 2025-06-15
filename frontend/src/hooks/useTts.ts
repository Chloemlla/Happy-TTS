import { useState } from 'react';
import axios from 'axios';

interface TtsRequest {
    text: string;
    model: string;
    voice: string;
    output_format: string;
    speed: number;
}

interface TtsResponse {
    fileName: string;
    audioUrl: string;
}

export const useTts = () => {
    const [isConverting, setIsConverting] = useState(false);

    const generateSpeech = async (request: TtsRequest): Promise<TtsResponse> => {
        setIsConverting(true);
        try {
            const response = await axios.post('/api/tts', request);
            return response.data;
        } finally {
            setIsConverting(false);
        }
    };

    const getHistory = async () => {
        try {
            const response = await axios.get('/api/tts/history');
            return response.data;
        } catch (error) {
            console.error('获取历史记录失败:', error);
            return [];
        }
    };

    return {
        generateSpeech,
        getHistory,
        isConverting
    };
}; 