/**
 * transformers.worker.js
 * Runs in a Web Worker — main thread stays responsive.
 *
 * [FIX] WebGPU removed entirely.
 * WebGPU causes "createBuffer failed, size too large" crashes on mid-range GPUs
 * (RTX 3050, etc.) because the browser + OS already consume most VRAM.
 * WASM/CPU is stable, deterministic, and fast enough for a 0.5B model.
 */
import { pipeline, env, TextStreamer } from '@huggingface/transformers';

// ── Environment: force CPU/WASM ──────────────────────────────────────────────
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 4;  // use multiple CPU threads for speed
env.backends.onnx.wasm.simd = true;     // SIMD is safe on WASM (not WebGPU)
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.gpu = false;          // [FIX] Disable GPU entirely

const MODEL_NAME = 'onnx-community/Qwen2.5-0.5B-Instruct';

let generator = null;
let isReady = false;
let abortGeneration = false;

// ── Helpers ──────────────────────────────────────────────────────────────────
function post(type, payload = {}) {
    self.postMessage({ type, ...payload });
}

// ── Cache check ───────────────────────────────────────────────────────────────
async function checkCache() {
    try {
        const cacheKeys = await caches.keys();
        for (const cacheName of cacheKeys) {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            const hit = keys.some(k =>
                k.url.includes(MODEL_NAME) ||
                k.url.includes('onnx/model') ||
                k.url.includes('.onnx_data')
            );
            if (hit) return true;
        }
    } catch (_) { /* ignore */ }
    return false;
}

// ── Clear cache ───────────────────────────────────────────────────────────────
async function clearCache() {
    try {
        const keys = await caches.keys();
        for (const k of keys) {
            if (k.startsWith('transformers-cache') || k.includes('huggingface')) {
                await caches.delete(k);
            }
        }
        return true;
    } catch (_) {
        return false;
    }
}

// ── Dispose model ─────────────────────────────────────────────────────────────
async function disposeModel() {
    if (!generator) return;
    try {
        if (generator.dispose) await generator.dispose();
        else if (generator.model?.dispose) await generator.model.dispose();
    } catch (_) { /* ignore */ }
    generator = null;
    isReady = false;
}

// ── Initialize pipeline ───────────────────────────────────────────────────────
async function initModel(isCancelled) {
    await disposeModel();

    post('PROGRESS', { status: 'searching', file: 'Scanning cache...', progress: 0 });

    const foundInCache = await checkCache();

    if (foundInCache) {
        post('PROGRESS', { status: 'searching', file: 'Found existing AI core!', progress: 100 });
        await new Promise(r => setTimeout(r, 500));
        post('CACHE_FOUND');
    }

    post('PROGRESS', {
        status: foundInCache ? 'Loading' : 'initiate',
        file: MODEL_NAME,
        progress: 0
    });

    generator = await pipeline('text-generation', MODEL_NAME, {
        device: 'wasm',   // [FIX] Always WASM — no GPU memory crashes
        dtype: 'q4',
        progress_callback: (data) => {
            if (isCancelled()) return;

            if (!foundInCache && (
                data.status === 'download' ||
                data.status === 'progress' ||
                data.status === 'initiate'
            )) {
                post('DOWNLOADING');
            }

            const displayStatus = foundInCache
                ? 'Loading'
                : (data.status === 'progress' || data.status === 'download'
                    ? 'Downloading'
                    : data.status);

            post('PROGRESS', { ...data, status: displayStatus });
        }
    });

    if (isCancelled()) {
        await disposeModel();
        post('ABORTED');
        return;
    }

    isReady = true;
    post('READY', { device: 'wasm' });
}

// ── Generate stream ───────────────────────────────────────────────────────────
async function generateText(prompt) {
    if (!isReady || !generator) {
        post('GEN_ERROR', { error: 'Model not ready' });
        return;
    }

    abortGeneration = false;

    try {
        const streamer = new TextStreamer(generator.tokenizer, {
            skip_prompt: true,
            callback_function: (token) => {
                if (abortGeneration) return;
                post('TOKEN', { token });
            }
        });

        const output = await generator(prompt, {
            max_new_tokens: 512,
            temperature: 0.7,
            do_sample: true,
            top_k: 40,
            top_p: 0.9,
            repetition_penalty: 1.15,
            streamer,
            return_full_text: false,
        });

        if (abortGeneration) {
            post('GEN_ABORTED');
            return;
        }

        post('GEN_DONE', { text: output[0]?.generated_text || '' });
    } catch (e) {
        post('GEN_ERROR', { error: e.message || String(e) });
    }
}

// ── Message handler ───────────────────────────────────────────────────────────
let _initCancelled = false;

self.onmessage = async ({ data }) => {
    const { type } = data;

    switch (type) {
        case 'INIT': {
            _initCancelled = false;
            try {
                await initModel(() => _initCancelled);
            } catch (e) {
                if (_initCancelled) {
                    post('ABORTED');
                } else {
                    post('INIT_ERROR', { error: e?.message || String(e) });
                }
            }
            break;
        }

        case 'ABORT_INIT': {
            _initCancelled = true;
            break;
        }

        case 'GENERATE': {
            await generateText(data.prompt);
            break;
        }

        case 'ABORT_GENERATION': {
            abortGeneration = true;
            break;
        }

        case 'CHECK_CACHE': {
            const found = await checkCache();
            post('CACHE_STATUS', { found });
            break;
        }

        case 'RESET': {
            _initCancelled = true;
            abortGeneration = true;
            await disposeModel();
            const ok = await clearCache();
            post('RESET_DONE', { ok });
            break;
        }

        default:
            console.warn('[Worker] Unknown message type:', type);
    }
};