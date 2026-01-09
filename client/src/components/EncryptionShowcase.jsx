import React, { useState, useEffect, useRef } from 'react';

const EncryptionShowcase = () => {
    const [text, setText] = useState('');
    const [encrypted, setEncrypted] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    
    // Cyberpunk char set for scrambling
    const chars = "XYZ01010101_#@!$%&*:<>?";
    
    useEffect(() => {
        if (!text) {
            setEncrypted('');
            return;
        }

        setIsTyping(true);
        const timeout = setTimeout(() => setIsTyping(false), 500);

        // Simulation of Block Cipher Avalanche Effect
        // Even a single char change causes the entire hash to change drastically
        const generatePseudoHash = (input) => {
            let hash = 0;
            for (let i = 0; i < input.length; i++) {
                const char = input.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            
            // Seed a random generator with this hash to create deterministic "ciphertext"
            const seed = Math.abs(hash);
            const chars = "0123456789ABCDEF";
            let result = "";
            
            // Generate a fixed-length block (e.g., 32 bytes for AES-256 visualization)
            // or dynamic length relative to input but with padding
            const blockLength = Math.max(32, Math.ceil(input.length / 16) * 16); 
            
            for (let i = 0; i < blockLength; i++) {
                // Simple seeded pseudo-random
                const val = Math.floor((Math.sin(seed + i) * 10000) % 16); 
                // fix negative mod
                const hexIndex = val < 0 ? val + 16 : val;
                result += chars[hexIndex];
                if ((i + 1) % 2 === 0 && i !== blockLength - 1) result += " "; // Space every 2 chars (byte view)
            }
            return result;
        };

        const scrambled = generatePseudoHash(text);
        setEncrypted(scrambled);

        return () => clearTimeout(timeout);
    }, [text]);

    return (
        <section className="relative py-20 sm:py-24 lg:py-32 overflow-hidden bg-black">
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle,rgba(0,255,0,0.03)_0%,transparent_50%)] z-0 pointer-events-none"></div>

            <div className="container mx-auto px-4 relative z-10">
                <div className="flex flex-col items-center gap-6 text-center mb-16">
                    <h2 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl md:text-5xl text-glow-green">
                        // YOU are the Encryption Engine
                    </h2>
                    <p className="mx-auto max-w-2xl text-base text-gray-400 sm:text-lg">
                        Type below. See how your private thoughts are instantly transformed into unbreakable code before they ever hit the network.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto items-stretch">
                    
                    {/* LEFT PANEL: PLAINTEXT (USER) */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-br from-accent-green to-transparent opacity-30 blur-sm rounded-lg group-hover:opacity-50 transition duration-500"></div>
                        <div className="relative h-full bg-deep-charcoal border border-accent-green/30 rounded-lg p-6 flex flex-col gap-4">
                            <div className="flex items-center gap-3 border-b border-accent-green/20 pb-4">
                                <span className="material-symbols-outlined text-accent-green text-sm">edit_square</span>
                                <span className="text-xs font-mono text-accent-green opacity-70">SENDER_TERMINAL</span>
                            </div>
                            
                            <div className="flex-grow flex flex-col gap-2">
                                <label className="text-sm text-gray-400 font-mono">&gt; INPUT_MESSAGE:</label>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Type your secret message here..."
                                    className="w-full h-full min-h-[200px] bg-transparent border-none outline-none resize-none font-mono text-lg md:text-xl text-accent-green placeholder:text-accent-green/20 focus:ring-0 leading-relaxed selection:bg-accent-green/20"
                                    spellCheck="false"
                                />
                            </div>
                            <div className="flex justify-between items-center text-xs text-accent-green/50 font-mono">
                                <span>CHARS: {text.length}</span>
                                <span className={isTyping ? "animate-pulse" : ""}>{isTyping ? "ENCRYPTING..." : "STANDBY"}</span>
                            </div>
                        </div>
                    </div>

                    {/* CENTER PANEL: CIPHERTEXT (NETWORK) */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-br from-accent-purple to-transparent opacity-30 blur-sm rounded-lg group-hover:opacity-50 transition duration-500"></div>
                        
                         {/* Connector Arrows - Moved outside to avid overflow-hidden clipping */}
                         <div className="absolute top-1/2 -right-3 translate-x-1/2 -translate-y-1/2 z-30 text-accent-purple hidden lg:block pointer-events-none">
                            <span className="material-symbols-outlined animate-pulse text-4xl drop-shadow-[0_0_10px_rgba(168,85,247,0.8)]">arrow_right_alt</span>
                        </div>
                        <div className="absolute top-1/2 -left-3 -translate-x-1/2 -translate-y-1/2 z-30 text-accent-green hidden lg:block pointer-events-none">
                            <span className="material-symbols-outlined animate-pulse text-4xl drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]">arrow_right_alt</span>
                        </div>

                        <div className="relative h-full bg-black border border-accent-purple/30 rounded-lg p-6 flex flex-col gap-4 overflow-hidden">
                            
                            {/* Matrix Rain Background Effect */}
                            <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
                                <div className="absolute -top-1/2 left-0 w-full text-[10px] sm:text-xs leading-none text-accent-purple whitespace-nowrap opacity-50 font-mono animate-matrix-rain" style={{ writingMode: 'vertical-rl' }}>
                                    010101010101010101010101010101010101010101010101
                                </div>
                                <div className="absolute -top-1/2 right-4 w-full text-[10px] sm:text-xs leading-none text-accent-purple whitespace-nowrap opacity-30 font-mono animate-matrix-rain" style={{ writingMode: 'vertical-rl', animationDelay: '1s' }}>
                                    X8F29A8C1010101010F29A8C1010101010101
                                </div>
                            </div>

                            <div className="flex items-center gap-3 border-b border-accent-purple/20 pb-4 relative z-10">
                                <span className="material-symbols-outlined text-accent-purple text-sm animate-spin-slow">hub</span>
                                <span className="text-xs font-mono text-accent-purple opacity-70">PUBLIC_NETWORK</span>
                                <div className="ml-auto px-2 py-0.5 rounded bg-accent-purple/10 text-[10px] text-accent-purple font-bold border border-accent-purple/20">
                                    AES-256
                                </div>
                            </div>

                            <div className="flex-grow relative z-10">
                                <label className="text-sm text-gray-500 font-mono mb-2 block">&gt; ENCRYPTED_STREAM:</label>
                                <div className="font-mono text-lg md:text-xl text-accent-purple break-all leading-relaxed drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
                                    {encrypted || <span className="animate-pulse opacity-30">WAITING_FOR_DATA...</span>}
                                </div>
                            </div>


                        </div>
                    </div>

                    {/* RIGHT PANEL: DECRYPTED (RECEIVER) */}
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-400 to-transparent opacity-30 blur-sm rounded-lg group-hover:opacity-50 transition duration-500"></div>
                        <div className="relative h-full bg-deep-charcoal border border-blue-400/30 rounded-lg p-6 flex flex-col gap-4">
                            <div className="flex items-center gap-3 border-b border-blue-400/20 pb-4">
                                <div className="size-3 rounded-full bg-blue-500 animate-pulse"></div>
                                <span className="text-xs font-mono text-blue-400 opacity-70">DESTINATION_DEVICE</span>
                            </div>
                            
                            <div className="flex-grow flex flex-col gap-2">
                                <label className="text-sm text-gray-400 font-mono">&gt; DECRYPTED_OUTPUT:</label>
                                <div className="w-full h-full min-h-[200px] font-mono text-lg md:text-xl text-blue-400 leading-relaxed whitespace-pre-wrap">
                                    {text || <span className="opacity-30">WAITING_FOR_HANDSHAKE...</span>}
                                </div>
                            </div>
                             <div className="flex justify-between items-center text-xs text-blue-400/50 font-mono">
                                <span>STATUS: VERIFIED</span>
                                <span>KEY: MATCH</span>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="mt-16 max-w-3xl mx-auto rounded-lg border border-accent-green/20 bg-deep-charcoal/50 p-6 text-center backdrop-blur-sm">
                    <div className="flex flex-col gap-2">
                         <h3 className="text-lg font-bold text-gray-100 flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-accent-green">verified_user</span>
                            <span className="text-glow-green">Cipher is End-to-End Encrypted</span>
                        </h3>
                        <div className="h-px w-16 bg-accent-green/30 mx-auto my-2"></div>
                        <p className="text-sm text-gray-400 font-mono">
                            <span className="text-accent-green">&gt; CURRENT_STATUS:</span> E2EE is fully active for <span className="text-gray-200">Direct(1-on-1 Text Messaging) & Group Chats</span>.
                        </p>
                        <p className="text-sm text-gray-400 font-mono">
                            <span className="text-accent-purple">&gt; IN_DEVELOPMENT:</span> Engineering team is currently extending E2EE protocols to support <span className="text-gray-200">File Media</span>.
                        </p>
                    </div>
                </div>

            </div>
        </section>
    );
};

export default EncryptionShowcase;
