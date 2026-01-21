import { pipeline, env, TextStreamer } from '@huggingface/transformers';

// [STABILITY] Maximum compatibility mode for Brave and older hardware
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1; 
env.backends.onnx.wasm.simd = false;  
env.backends.onnx.wasm.proxy = false; // [STABILITY] Keep false, true causes "window is not defined" error in workers
env.backends.onnx.gpu = true;         

// [NOTE] Switched to Qwen2.5-0.5B-Instruct for ultra-stability.
// 0.5B is significantly lighter than 1B/3B models, preventing OOM crashes in Brave.
const MODEL_NAME = 'onnx-community/Qwen2.5-0.5B-Instruct'; 

class TransformersService {
    constructor() {
        this.generator = null;
        this.modelId = MODEL_NAME; 
        this.ready = false;
        this.loadingPromise = null;
    }

    async initialize(progressCallback, signal = null) {
        if (this.ready) return;
        if (this.loadingPromise) return this.loadingPromise;

        // [MEMORY] Cleanup old instances if any exist before re-loading
        await this.dispose();

        this.loadingPromise = (async () => {
            try {
                console.log('[TransformersService] Loading model:', this.modelId);
                
                // [FIX] Force q4f16 for balance of size/quality.
                // device: 'webgpu' is essential.
                this.generator = await pipeline('text-generation', this.modelId, {
                    device: 'webgpu',
                    dtype: 'q4', // [MEMORY] Use most efficient quantization
                    progress_callback: progressCallback,
                    // If your transformers.js version supports passing signal in options:
                    ...(signal ? { signal } : {})
                });

                this.ready = true;
                console.log('[TransformersService] Model loaded');
            } catch (e) {
                console.error('[TransformersService] Failed to load model:', e);
                
                // [FIX] Robust error handling for non-Error objects (WASM pointers, etc)
                const errorMessage = (e && e.message) ? e.message : String(e);
                
                // Detect specific errors
                if (errorMessage.includes('createBuffer') || 
                    errorMessage.includes('memory copy') || 
                    errorMessage.includes('Aborted') ||
                    !isNaN(Number(errorMessage)) // If it's just a number (WASM error code)
                ) {
                    throw new Error("GPU Memory Error or Corrupted Cache. Please reset.");
                }
                throw e;
            } finally {
                this.loadingPromise = null;
            }
        })();

        return this.loadingPromise;
    }

    async dispose() {
        if (this.generator) {
            try {
                // Explicitly dispose of the generator and its sessions if the library supports it
                if (this.generator.dispose) {
                    await this.generator.dispose();
                } else if (this.generator.model && this.generator.model.dispose) {
                    await this.generator.model.dispose();
                }
            } catch (e) {
                console.warn('[TransformersService] Dispose warning:', e);
            }
            this.generator = null;
        }
        this.ready = false;
        this.loadingPromise = null;
    }

    async reset() {
        await this.dispose();
        // Attempt to clear browser cache for transformers
        try {
            const cacheKeys = await caches.keys();
            for (const key of cacheKeys) {
                if (key.startsWith('transformers-cache')) {
                    await caches.delete(key);
                }
            }
            this.ready = false;
            this.generator = null;
            console.log('[TransformersService] Cache cleared');
            return true;
        } catch (e) {
            console.error('Failed to clear cache:', e);
            return false;
        }
    }

    async checkCache() {
        try {
            const cacheKeys = await caches.keys();
            if (cacheKeys.length === 0) return false;

            // Prioritize transformers-cache
            const sortedKeys = cacheKeys.sort((a,b) => {
                if (a.startsWith('transformers-cache')) return -1;
                if (b.startsWith('transformers-cache')) return 1;
                return 0;
            });

            for (const cacheName of sortedKeys) {
                const cache = await caches.open(cacheName);
                const keys = await cache.keys();
                
                // Be very broad: look for modelId or technical file extensions like onnx_data
                const hasModelFiles = keys.some(k => 
                    k.url.includes(this.modelId) || 
                    k.url.includes('onnx/model') ||
                    k.url.includes('.onnx_data')
                );
                
                if (hasModelFiles) {
                    console.log(`[TransformersService] Cache hit in: ${cacheName}`);
                    return true;
                }
            }
            return false;
        } catch (e) {
            console.error('[TransformersService] checkCache error:', e);
            return false;
        }
    }

    async generateStream(messages, onToken, onDone, onError, signal = null) {
        if (!this.ready) {
            onError('Model not ready');
            return;
        }

        try {
            // Create a custom streamer that callbacks
            const streamer = new TextStreamer(this.generator.tokenizer, {
                skip_prompt: true,
                callback_function: (text) => {
                    onToken(text);
                }
            });

            // [FIX] Ensure pure ChatML format. 
            // If the message is already formatted, use it directly.
            // If it's a raw string from elsewhere, wrap it.
            let inputs = messages;
            if (typeof messages === 'string' && !messages.includes('<|im_start|>')) {
                inputs = `<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>user\n${messages}<|im_end|>\n<|im_start|>assistant\n`;
            }
            // If already formatted (multi-turn), use as-is


            // Note: generate() keeps running. We need to await it.
            const output = await this.generator(inputs, {
                max_new_tokens: 512, // [MOD] Increased to user preference
                temperature: 0.7,
                do_sample: true,
                top_k: 40,
                top_p: 0.9,          // [NEW] Nucleus sampling for quality
                repetition_penalty: 1.15, // [FIX] Prevent the "s s s" or repeating issues
                streamer: streamer,
                return_full_text: false,
                signal: signal       // [NEW] Allow interruption
            });
            
            onDone(output[0]?.generated_text || "");

        } catch (e) {
            console.error('[TransformersService] Generation error:', e);
            onError(e.message);
        }
    }
}

export const transformersService = new TransformersService();
