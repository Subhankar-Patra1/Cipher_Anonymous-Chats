/**
 * TransformersService.js
 * Main-thread wrapper around transformers.worker.js
 * All heavy ML work runs in the worker — this file just routes messages.
 */

class TransformersService {
    constructor() {
        this.worker = null;
        this.ready = false;

        // Pending callbacks keyed by operation type
        this._progressCb = null;
        this._onToken = null;
        this._onDone = null;
        this._onError = null;
        this._initResolve = null;
        this._initReject = null;
        this._cacheResolve = null;
        this._resetResolve = null;
    }

    // ── Ensure worker is created ──────────────────────────────────────────────
    _ensureWorker() {
        if (this.worker) return;

        // Vite/modern bundler syntax for worker modules
        this.worker = new Worker(
            new URL('./transformers.worker.js', import.meta.url),
            { type: 'module' }
        );

        this.worker.onmessage = ({ data }) => this._handleMessage(data);
        this.worker.onerror = (e) => {
            console.error('[TransformersService] Worker error:', e);
            if (this._initReject) {
                this._initReject(new Error(e.message || 'Worker crashed'));
                this._initReject = null;
                this._initResolve = null;
            }
            if (this._onError) {
                this._onError(e.message || 'Worker crashed');
            }
        };
    }

    // ── Handle messages from worker ───────────────────────────────────────────
    _handleMessage(data) {
        switch (data.type) {
            case 'PROGRESS':
                if (this._progressCb) this._progressCb(data);
                break;

            case 'DOWNLOADING':
                // surfaced via PROGRESS data.status — no extra handling needed
                break;

            case 'CACHE_FOUND':
                // worker found existing cache — context handles flag updates via READY
                break;

            case 'READY':
                this.ready = true;
                if (this._initResolve) {
                    this._initResolve();
                    this._initResolve = null;
                    this._initReject = null;
                }
                break;

            case 'INIT_ERROR': {
                this.ready = false;
                const err = new Error(data.error || 'Model init failed');
                if (this._initReject) {
                    this._initReject(err);
                    this._initResolve = null;
                    this._initReject = null;
                }
                break;
            }

            case 'ABORTED': {
                this.ready = false;
                const abortErr = new Error('Aborted');
                abortErr.name = 'AbortError';
                if (this._initReject) {
                    this._initReject(abortErr);
                    this._initResolve = null;
                    this._initReject = null;
                }
                break;
            }

            case 'TOKEN':
                if (this._onToken) this._onToken(data.token);
                break;

            case 'GEN_DONE':
                if (this._onDone) {
                    const cb = this._onDone;
                    this._clearGenCallbacks();
                    cb(data.text);
                }
                break;

            case 'GEN_ABORTED':
                if (this._onError) {
                    const cb = this._onError;
                    this._clearGenCallbacks();
                    cb('Aborted');
                }
                break;

            case 'GEN_ERROR':
                if (this._onError) {
                    const cb = this._onError;
                    this._clearGenCallbacks();
                    cb(data.error);
                }
                break;

            case 'CACHE_STATUS':
                if (this._cacheResolve) {
                    this._cacheResolve(data.found);
                    this._cacheResolve = null;
                }
                break;

            case 'RESET_DONE':
                this.ready = false;
                if (this._resetResolve) {
                    this._resetResolve(data.ok);
                    this._resetResolve = null;
                }
                break;

            default:
                break;
        }
    }

    _clearGenCallbacks() {
        this._onToken = null;
        this._onDone = null;
        this._onError = null;
    }

    // ── Public API (identical contract to old TransformersService) ────────────

    /**
     * Initialize / download the model.
     * @param {function} progressCallback
     * @param {AbortSignal} signal
     */
    async initialize(progressCallback, signal = null) {
        if (this.ready) return;

        this._ensureWorker();
        this._progressCb = progressCallback;

        if (signal) {
            signal.addEventListener('abort', () => {
                if (this.worker) this.worker.postMessage({ type: 'ABORT_INIT' });
            }, { once: true });
        }

        return new Promise((resolve, reject) => {
            this._initResolve = resolve;
            this._initReject = reject;
            this.worker.postMessage({ type: 'INIT' });
        });
    }

    /**
     * Check if model files are already in browser cache.
     * @returns {Promise<boolean>}
     */
    async checkCache() {
        this._ensureWorker();
        return new Promise((resolve) => {
            this._cacheResolve = resolve;
            this.worker.postMessage({ type: 'CHECK_CACHE' });
        });
    }

    /**
     * Stream text generation.
     * @param {string} prompt
     * @param {function} onToken
     * @param {function} onDone
     * @param {function} onError
     * @param {AbortSignal} signal
     */
    generateStream(prompt, onToken, onDone, onError, signal = null) {
        if (!this.ready) {
            onError('Model not ready. Please wait for the AI to finish loading.');
            return;
        }

        this._onToken = onToken;
        this._onDone = onDone;
        this._onError = onError;

        if (signal) {
            signal.addEventListener('abort', () => {
                if (this.worker) this.worker.postMessage({ type: 'ABORT_GENERATION' });
            }, { once: true });
        }

        this.worker.postMessage({ type: 'GENERATE', prompt });
    }

    /**
     * Clear cache and destroy worker.
     * @returns {Promise<boolean>}
     */
    async reset() {
        if (!this.worker) {
            // No worker — clear directly on main thread
            try {
                const keys = await caches.keys();
                for (const k of keys) {
                    if (k.startsWith('transformers-cache') || k.includes('huggingface')) {
                        await caches.delete(k);
                    }
                }
            } catch (_) { /* ignore */ }
            this.ready = false;
            return true;
        }

        return new Promise((resolve) => {
            this._resetResolve = (ok) => {
                this.worker.terminate();
                this.worker = null;
                this.ready = false;
                resolve(ok);
            };
            this.worker.postMessage({ type: 'RESET' });
        });
    }

    /**
     * Terminate the worker (call on app unmount if needed).
     */
    dispose() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.ready = false;
        this._clearGenCallbacks();
        this._progressCb = null;
        this._initResolve = null;
        this._initReject = null;
        this._cacheResolve = null;
        this._resetResolve = null;
    }
}

// Singleton — same import as before
export const transformersService = new TransformersService();