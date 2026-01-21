/**
 * GroqService handles communication with the Groq Cloud API (console.groq.com).
 * It uses their OpenAI-compatible streaming API for ultra-fast LPU inference.
 */
class GroqService {
    constructor() {
        this.apiKey = localStorage.getItem('groq_api_key') || '';
        this.model = 'llama-3.3-70b-versatile'; // Standard smart recommendation
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('groq_api_key', key);
    }

    setModel(modelId) {
        this.model = modelId;
    }

    async generateStream(messages, onToken, onDone, onError, signal = null) {
        if (!this.apiKey) {
            onError('No Groq API Key found. Please add it in settings.');
            return;
        }

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    stream: true,
                    temperature: 0.7,
                    max_tokens: 1024
                }),
                signal: signal
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `Groq API Error: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let finished = false;

            while (!finished) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') {
                            finished = true;
                            break;
                        }

                        try {
                            const data = JSON.parse(dataStr);
                            const content = data.choices[0]?.delta?.content || '';
                            if (content) {
                                fullText += content;
                                onToken(content);
                            }
                        } catch (e) {
                            // Partial chunk or empty line, ignore
                        }
                    }
                }
            }

            onDone(fullText);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('[GroqService] Generation aborted');
                return;
            }
            console.error('[GroqService] Error:', error);
            onError(error.message);
        }
    }
}

export const groqService = new GroqService();
export default groqService;
