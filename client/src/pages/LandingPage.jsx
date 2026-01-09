import EncryptionShowcase from '../components/EncryptionShowcase';
import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const LandingPage = () => {
    const navigate = useNavigate();
    const [isNavigating, setIsNavigating] = useState(false);
    const [loadingText, setLoadingText] = useState('INITIALIZING...');

    const handleNavigation = (e) => {
        e.preventDefault();
        setIsNavigating(true);
        
        const steps = [
            { t: 0, text: 'INITIALIZING SECURE UPLINK...' },
            { t: 400, text: 'BYPASSING FIREWALLS...' },
            { t: 800, text: 'ESTABLISHING HANDSHAKE...' },
            { t: 1200, text: 'ACCESS GRANTED.' }
        ];

        steps.forEach(({ t, text }) => {
            setTimeout(() => setLoadingText(text), t);
        });

        setTimeout(() => {
            navigate('/auth');
        }, 1600);
    };

    const [terminalInput, setTerminalInput] = useState('');
    const [terminalHistory, setTerminalHistory] = useState([
        { type: 'system', content: 'Cipher Terminal [Version 1.0.0]' },
        { type: 'system', content: '(c) 2025 Cipher. All rights reserved.' },
        { type: 'info', content: 'Type /help to see available commands.' }
    ]);
    const terminalContainerRef = useRef(null);

    const handleTerminalSubmit = (e) => {
        e.preventDefault();
        if (!terminalInput.trim()) return;

        const newHistory = [...terminalHistory, { type: 'user', content: `> ${terminalInput}` }];
        
        let response;
        const command = terminalInput.toLowerCase().trim();
        
        if (command === '/help') {
            response = { type: 'system', content: 'Available commands: /status, /clear, /join, /about' };
        } else if (command === '/status') {
            response = { type: 'success', content: 'SYSTEM STATUS: NOMINAL | ENCRYPTION: AES-256 | NODES: 8,492' };
        } else if (command === '/clear') {
            setTerminalHistory([]);
            setTerminalInput('');
            return;
        } else if (command === '/join') {
            setIsNavigating(true);
            setTimeout(() => navigate('/auth'), 1500);
            return;
        } else if (command === '/about') {
            response = { type: 'info', content: 'Cipher is a secure, ephemeral chat protocol.' };
        } else {
            response = { type: 'error', content: `Command not found: ${command}` };
        }

        setTerminalHistory([...newHistory, response]);
        setTerminalInput('');
    };

    useEffect(() => {
        if (terminalContainerRef.current) {
            terminalContainerRef.current.scrollTop = terminalContainerRef.current.scrollHeight;
        }
    }, [terminalHistory]);

    useEffect(() => {
        const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
        
        const hackerWords = document.querySelectorAll(".hacker-word");
        
        const handleMouseOver = (event) => {
            let iteration = 0;
            const target = event.target;
            const originalText = target.dataset.value;
            
            clearInterval(target.interval);
            
            target.interval = setInterval(() => {
                target.innerText = target.innerText
                    .split("")
                    .map((letter, index) => {
                        if(index < iteration) {
                            return originalText[index];
                        }
                    
                        return letters[Math.floor(Math.random() * letters.length)]
                    })
                    .join("");
                
                if(iteration >= originalText.length){ 
                    clearInterval(target.interval);
                }
                
                iteration += 1 / 3;
            }, 30);
        };

        hackerWords.forEach(word => {
            word.addEventListener('mouseover', handleMouseOver);
            // Trigger animation on load (simulated by calling it once)
            handleMouseOver({ target: word });
        });

        document.documentElement.classList.add('landing-scroll');
        
        return () => {
             document.documentElement.classList.remove('landing-scroll');
             hackerWords.forEach(word => {
                word.removeEventListener('mouseover', handleMouseOver);
                clearInterval(word.interval);
            });
        };
    }, []);

    return (
        <div className="relative flex min-h-screen w-full flex-col bg-deep-charcoal font-mono text-gray-200 antialiased scanline pb-8">
            {/* Onboarding Transition Overlay */}
            {isNavigating && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black font-mono text-accent-green text-glow-green">
                    <div className="flex flex-col items-center gap-4">
                        <div className="text-2xl font-bold animate-pulse">{loadingText}</div>
                        <div className="w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-accent-green animate-progress-bar"></div>
                        </div>
                        <div className="text-xs text-gray-500 mt-2 font-mono">
                            ENCRYPTING: <span className="text-white">{Math.floor(Math.random() * 999999)}</span>
                        </div>
                    </div>
                </div>
            )}
            
            {/* System Status Ticker */}
            <div className="fixed bottom-0 left-0 z-50 w-full overflow-hidden bg-black/90 border-t border-accent-green/30 py-1 font-mono text-xs text-accent-green backdrop-blur-md">
                <div className="animate-marquee whitespace-nowrap flex w-max">
                     {[...Array(10)].map((_, i) => (
                        <div key={i} className="flex gap-8 shrink-0 pr-8">
                            <span>SYSTEM STATUS: ONLINE</span>
                            <span>|</span>
                            <span>ENCRYPTION: AES-256-GCM</span>
                            <span>|</span>
                            <span>ACTIVE NODES: 8,492</span>
                            <span>|</span>
                            <span>DATA PURGED (24H): 1.2TB</span>
                            <span>|</span>
                            <span>THREAT LEVEL: NONE</span>
                            <span>|</span>
                            <span>LATEST HASH: 0x9f8a...3b2c</span>
                            <span>|</span>
                        </div>
                     ))}
                </div>
            </div>

            <div className="grid-background"></div>

            <header className="sticky top-0 z-50 w-full bg-deep-charcoal/80 backdrop-blur-sm border-b border-accent-green/20">
                <div className="container mx-auto px-4">
                    <div className="flex h-20 items-center justify-between">
                        <div className="flex items-center gap-3">
                                <img src="/logo.png" alt="Cipher Logo" className="size-9" />
                                <h2 className="text-xl font-bold text-gray-100 text-glow-green">Cipher</h2>
                        </div>
                        <nav className="hidden items-center gap-8 md:flex">
                            <a className="text-sm font-medium hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#features">Features</a>
                            <a className="text-sm font-medium hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#how-it-works">How It Works</a>
                            <a className="text-sm font-medium hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#security">Security</a>
                        </nav>
                        <button onClick={handleNavigation} className="flex h-10 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-full bg-accent-green px-4 text-sm font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green-sm decoration-0">
                            <span className="truncate">Get Started</span>
                        </button>
                    </div>
                </div>
            </header>

            <main>
                <section className="relative py-20 sm:py-24 lg:py-32">
                    <div className="container mx-auto grid grid-cols-1 gap-12 px-4 lg:grid-cols-2 lg:items-center">
                        <div className="flex flex-col items-center gap-8 text-center lg:items-start lg:text-left">
                            <div className="flex flex-col gap-4">
                                <h1 className="text-4xl font-bold tracking-tighter text-gray-100 sm:text-5xl md:text-6xl lg:text-7xl text-glow-green flex flex-wrap gap-x-4 justify-center lg:justify-start">
                                    <span className="hacker-word" data-value="//">//</span>
                                    <span className="hacker-word" data-value="Chat">Chat</span>
                                    <span className="hacker-word" data-value="without">without</span>
                                    <span className="hacker-word" data-value="Limits.">Limits.</span>
                                </h1>
                                <h2 className="max-w-md text-base text-gray-400 sm:text-lg">
                                    &gt; Instant, secure, and ephemeral chat rooms for any conversation.
                                </h2>
                            </div>
                            <div className="flex flex-wrap justify-center gap-4 lg:justify-start">
                                <button onClick={handleNavigation} className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-green px-6 text-base font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green decoration-0">
                                    <span className="truncate">// Get Started</span>
                                </button>
                                <button onClick={handleNavigation} className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-purple/20 border border-accent-purple px-6 text-base font-bold text-white transition-colors hover:bg-accent-purple/40 text-glow-purple decoration-0">
                                    <span className="truncate">// Create a Room</span>
                                </button>
                            </div>
                        </div>
                        <div className="relative flex h-full min-h-[300px] w-full items-center justify-center lg:min-h-[400px]">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="relative w-full max-w-lg rounded-lg border border-accent-green/30 bg-black p-4 shadow-2xl glow-shadow overflow-hidden">
                                    <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(0,255,0,0.05)_1px,_transparent_1px),_linear-gradient(to_right,_rgba(0,255,0,0.05)_1px,_transparent_1px)]" style={{ backgroundSize: '20px 20px', opacity: 0.1 }}></div>
                                    <div className="absolute top-2 left-2 flex gap-2">
                                        <span className="size-3 rounded-full bg-red-500"></span>
                                        <span className="size-3 rounded-full bg-yellow-500"></span>
                                        <span className="size-3 rounded-full bg-green-500"></span>
                                    </div>
                                    <pre className="relative z-10 mt-8 font-mono text-sm leading-relaxed text-gray-300">
                                        <span className="text-accent-green">&gt; [SYSTEM] Initializing secure connection... OK</span><br/>
                                        <span className="text-accent-purple">&gt; [NETWORK] Data stream established.</span><br/>
                                        <span className="animate-pulse-line">&gt; <span className="text-accent-green">User 'Neon_Ghost' joined room <span className="text-accent-purple">#CYBERNET-01</span></span></span><br/>
                                        <span className="animate-pulse-line" style={{ animationDelay: '0.5s' }}>&gt; <span className="text-accent-green">User 'Data_Runner' sent: "Anyone seen the latest neural net update?"</span></span><br/>
                                        <span className="animate-pulse-line" style={{ animationDelay: '1s' }}>&gt; <span className="text-accent-purple">Room Code: <span className="text-glow-green text-lg">X4T-9B1</span></span></span><br/>
                                        <span className="animate-pulse-line" style={{ animationDelay: '1.5s' }}>&gt; <span className="text-accent-green">User 'Synth_Wave' sent: "Yeah, patching now."</span></span><br/>
                                        <span className="animate-pulse-line" style={{ animationDelay: '2s' }}>&gt; <span className="text-accent-purple">New Room Available: <span className="text-glow-green text-lg">Z9L-2F8</span> (Topic: AI Ethics)</span></span><br/>
                                        <span className="animate-pulse-line" style={{ animationDelay: '2.5s' }}>&gt; <span className="text-accent-green">User 'Ghost_Hack' joined room <span className="text-accent-purple">#CYBERNET-01</span></span></span><br/>
                                        <span className="text-accent-purple">&gt; [INFO] Room <span className="text-accent-green">#CYBERNET-01</span> active users: 5</span>
                                    </pre>
                                    <div className="absolute inset-0 pointer-events-none rounded-lg border border-accent-green/50 opacity-50 animate-pulse-line"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-24 lg:py-32" id="features">
                    <div className="container mx-auto flex flex-col gap-12 px-4">
                        <div className="flex flex-col gap-4 text-center">
                            <h2 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl md:text-5xl text-glow-green">
                                // Core Protocols for Seamless Communication
                            </h2>
                            <p className="mx-auto max-w-2xl text-base text-gray-400 sm:text-lg">
                                &gt; Cipher is engineered for rapid, secure, and intuitive data exchange. Observe our unique functionalities.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="flex flex-col gap-4 rounded-lg border border-accent-green/20 bg-deep-charcoal/70 p-6 shadow-sm hover:border-accent-green/40 transition-colors">
                                <span className="material-symbols-outlined text-3xl text-accent-green text-glow-green">rocket_launch</span>
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-bold text-gray-100 text-glow-green/80">// Deploy Rooms in Nanoseconds</h2>
                                    <p className="text-sm text-gray-400">Instantiate new secure chat conduits for your collective, contacts, or event streams instantly.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4 rounded-lg border border-accent-purple/20 bg-deep-charcoal/70 p-6 shadow-sm hover:border-accent-purple/40 transition-colors">
                                <span className="material-symbols-outlined text-3xl text-accent-purple text-glow-purple">qr_code_scanner</span>
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-bold text-gray-100 text-glow-purple/80">// Link, Code, or QR Access Modules</h2>
                                    <p className="text-sm text-gray-400">Multiple entry vectors ensure frictionless integration for all operatives.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4 rounded-lg border border-accent-green/20 bg-deep-charcoal/70 p-6 shadow-sm hover:border-accent-green/40 transition-colors">
                                <span className="material-symbols-outlined text-3xl text-accent-green text-glow-green">history_toggle_off</span>
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-bold text-gray-100 text-glow-green/80">// Room Protocol Auto-Purge (48h)</h2>
                                    <p className="text-sm text-gray-400">Your data streams are encrypted and automatically purged for maximum discretion.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4 rounded-lg border border-accent-purple/20 bg-deep-charcoal/70 p-6 shadow-sm hover:border-accent-purple/40 transition-colors">
                                <span className="material-symbols-outlined text-3xl text-accent-purple text-glow-purple">forum</span>
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-bold text-gray-100 text-glow-purple/80">// Direct Neural Interface (DNI) Chats</h2>
                                    <p className="text-sm text-gray-400">Initiate peer-to-peer secure data links with any individual within a channel.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4 rounded-lg border border-accent-green/20 bg-deep-charcoal/70 p-6 shadow-sm hover:border-accent-green/40 transition-colors">
                                <span className="material-symbols-outlined text-3xl text-accent-green text-glow-green">shield</span>
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-bold text-gray-100 text-glow-green/80">// High-Speed Secure Data Transmission</h2>
                                    <p className="text-sm text-gray-400">Engineered on a resilient stack for instantaneous and encrypted message delivery.</p>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4 rounded-lg border border-accent-purple/20 bg-deep-charcoal/70 p-6 shadow-sm hover:border-accent-purple/40 transition-colors">
                                <span className="material-symbols-outlined text-3xl text-accent-purple text-glow-purple">devices</span>
                                <div className="flex flex-col gap-1">
                                    <h2 className="text-lg font-bold text-gray-100 text-glow-purple/80">// Universal Access Node</h2>
                                    <p className="text-sm text-gray-400">Optimized for any interface—desktop, slate, or mobile terminal.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-24 lg:py-32" id="how-it-works">
                    <div className="container mx-auto flex flex-col items-center gap-12 px-4">
                        <div className="flex flex-col gap-4 text-center">
                            <h2 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl md:text-5xl text-glow-green">// Operational Flow Diagram</h2>
                            <p className="mx-auto max-w-2xl text-base text-gray-400 sm:text-lg">Acquire operational status in minimal cycles. Optimized, secure, and instantaneous.</p>
                        </div>
                        <div className="grid w-full max-w-4xl grid-cols-1 items-start gap-8 md:grid-cols-2">
                            <div className="grid grid-cols-[40px_1fr] gap-x-4">
                                <div className="flex flex-col items-center gap-2 pt-2">
                                    <div className="flex size-10 items-center justify-center rounded-full bg-accent-green/20 text-accent-green text-glow-green"><span className="material-symbols-outlined">person_add</span></div>
                                    <div className="w-px grow bg-accent-green/30"></div>
                                </div>
                                <div className="flex flex-1 flex-col pb-12 pt-1">
                                    <p className="text-sm font-medium text-gray-500">// Step 1</p>
                                    <p className="text-lg font-bold text-gray-100 text-glow-green/80">User Authentication</p>
                                    <p className="text-base text-gray-400">Establish your digital identity in milliseconds. No biometric data required.</p>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-2 w-px bg-accent-green/30"></div>
                                    <div className="flex size-10 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple text-glow-purple"><span className="material-symbols-outlined">add_circle</span></div>
                                    <div className="w-px grow bg-accent-green/30"></div>
                                </div>
                                <div className="flex flex-1 flex-col pb-12">
                                    <p className="text-sm font-medium text-gray-500">// Step 2</p>
                                    <p className="text-lg font-bold text-gray-100 text-glow-purple/80">Room Creation / Join Protocol</p>
                                    <p className="text-base text-gray-400">Initiate new data conduits or ingress existing ones via protocol key, link, or QR.</p>
                                </div>
                                <div className="flex flex-col items-center gap-2">
                                    <div className="h-2 w-px bg-accent-green/30"></div>
                                    <div className="flex size-10 items-center justify-center rounded-full bg-accent-green/20 text-accent-green text-glow-green"><span className="material-symbols-outlined">chat</span></div>
                                </div>
                                <div className="flex flex-1 flex-col">
                                    <p className="text-sm font-medium text-gray-500">// Step 3</p>
                                    <p className="text-lg font-bold text-gray-100 text-glow-green/80">Commence Data Exchange</p>
                                    <p className="text-base text-gray-400">System online. Enjoy encrypted, high-throughput messaging with your cohort.</p>
                                </div>
                            </div>
                            <div className="flex h-full items-center justify-center">
                                <div className="w-full max-w-sm rounded-lg border border-accent-purple/20 bg-deep-charcoal/70 p-6 shadow-lg glow-shadow">
                                    <div className="flex flex-col items-center gap-4 text-center">
                                        <div className="flex size-14 items-center justify-center rounded-full bg-accent-green/20 text-accent-green text-glow-green">
                                            <span className="material-symbols-outlined text-3xl">check_circle</span>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-100 text-glow-green">// Room Genesis Complete!</h3>
                                        <p className="text-sm text-gray-400">Transmit this protocol key to authorize others' entry into your channel.</p>
                                        <div className="my-2 flex w-full items-center justify-center rounded-md border-2 border-dashed border-accent-green bg-black py-4">
                                            <p className="text-2xl font-bold tracking-[0.2em] text-accent-green text-glow-green">A9B-3C4</p>
                                        </div>
                                        <button onClick={handleNavigation} className="flex h-10 w-full cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-green px-4 text-sm font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green decoration-0">
                                            <span className="truncate">// Copy Protocol Key &amp; Access Link</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Encryption Showcase Section */}
                <EncryptionShowcase />


                <section className="py-20 sm:py-24 lg:py-32" id="faq">
                    <div className="container mx-auto px-4">
                        <div className="flex flex-col gap-12">
                            <div className="text-center">
                                <h2 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl text-glow-green">// Frequently Requested Data</h2>
                                <p className="mt-4 text-gray-400">&gt; Clarifying operational parameters and security protocols.</p>
                            </div>
                            <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
                                <div className="group rounded-lg border border-accent-green/20 bg-deep-charcoal/50 p-6 hover:border-accent-green/40 transition-colors">
                                    <h3 className="flex items-center gap-3 text-lg font-bold text-gray-100 text-glow-green">
                                        <span className="material-symbols-outlined text-accent-green">question_mark</span>
                                        Is this truly anonymous?
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-gray-400 md:text-base">
                                        Affirmative. We require zero biometric data or personal identifiers. Your digital footprint remains null.
                                    </p>
                                </div>
                                <div className="group rounded-lg border border-accent-purple/20 bg-deep-charcoal/50 p-6 hover:border-accent-purple/40 transition-colors">
                                    <h3 className="flex items-center gap-3 text-lg font-bold text-gray-100 text-glow-purple">
                                        <span className="material-symbols-outlined text-accent-purple">hourglass_empty</span>
                                        How long is data retained?
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-gray-400 md:text-base">
                                        All room data is subject to a hard purge cycle of 48 hours. No backups. No archives. Total erasure.
                                    </p>
                                </div>
                                <div className="group rounded-lg border border-accent-purple/20 bg-deep-charcoal/50 p-6 hover:border-accent-purple/40 transition-colors">
                                    <h3 className="flex items-center gap-3 text-lg font-bold text-gray-100 text-glow-purple">
                                        <span className="material-symbols-outlined text-accent-purple">settings_backup_restore</span>
                                        Can I recover a room?
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-gray-400 md:text-base">
                                        Negative. Once the purge protocol executes, data is irretrievable. Design purpose: Maximum security.
                                    </p>
                                </div>
                                <div className="group rounded-lg border border-accent-green/20 bg-deep-charcoal/50 p-6 hover:border-accent-green/40 transition-colors">
                                    <h3 className="flex items-center gap-3 text-lg font-bold text-gray-100 text-glow-green">
                                        <span className="material-symbols-outlined text-accent-green">code</span>
                                        Is it open source?
                                    </h3>
                                    <p className="mt-3 text-sm leading-relaxed text-gray-400 md:text-base">
                                        The core protocols are transparent to verify security integrity. Trust through verification.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="bg-deep-charcoal/70 py-20 sm:py-24 lg:py-32" id="security">
                    <div className="container mx-auto px-4">
                        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
                            <div className="flex flex-col gap-4">
                                <h2 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl text-glow-green">// Data Privacy: Our Prime Directive</h2>
                                <p className="text-base text-gray-400 sm:text-lg">We uphold your right to private data streams. ChatRooms is architected with a robust security framework, ensuring classified communication.</p>
                            </div>
                            <div className="flex flex-col gap-6">
                                <div className="flex items-start gap-4">
                                    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-green/20 text-accent-green text-glow-green">
                                        <span className="material-symbols-outlined">no_sim</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-100 text-glow-green/80">// No Biometric Signature Required</h3>
                                        <p className="text-sm text-gray-400">Authenticate with a simple username. We do not demand personal identifiers.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-purple/20 text-accent-purple text-glow-purple">
                                        <span className="material-symbols-outlined">policy</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-100 text-glow-purple/80">// Respecting Your Digital Footprint</h3>
                                        <p className="text-sm text-gray-400">We do not monetize your data. Channels and messages are automatically purged.</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-4">
                                    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-green/20 text-accent-green text-glow-green">
                                        <span className="material-symbols-outlined">storage</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-100 text-glow-green/80">// Localized Authentication Protocols</h3>
                                        <p className="text-sm text-gray-400">Maintain session continuity on your device without transmitting credentials over the network.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-24 lg:py-32 bg-deep-charcoal">
                    <div className="container mx-auto px-4">
                        <div className="text-center mb-12">
                            <h2 className="text-3xl font-bold tracking-tighter text-gray-100 text-glow-green">// Intercepted Transmissions</h2>
                            <p className="mt-4 text-gray-400">&gt; Decrypted logic streams from verified operatives.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { user: 'User_X7', msg: 'Zero logs. Zero trace. Finally a protocol I can trust.', time: '14ms ago' },
                                { user: 'Dev_Null', msg: 'The DNI feature works flawlessly. Encrypted pipeline confirmed.', time: '42ms ago' },
                                { user: 'Neon_Wraith', msg: 'Switching my entire collective to Cipher. Speed is unmatched.', time: '128ms ago' }
                            ].map((item, i) => (
                                <div key={i} className="group relative overflow-hidden rounded-md border border-accent-green/20 bg-black p-6 hover:border-accent-green/50 transition-colors">
                                    <div className="absolute top-0 right-0 p-2 opacity-50 font-mono text-[10px] text-accent-green">{item.time}</div>
                                    <div className="mb-4 flex items-center gap-3">
                                        <div className="flex size-8 items-center justify-center rounded-sm bg-accent-green/10 text-accent-green">
                                            <span className="material-symbols-outlined text-sm">terminal</span>
                                        </div>
                                        <p className="font-bold text-gray-300 text-sm">{item.user}</p>
                                    </div>
                                    <p className="font-mono text-sm text-accent-purple">&gt; "{item.msg}"</p>
                                    <div className="mt-4 h-px w-full bg-gradient-to-r from-accent-green/0 via-accent-green/20 to-accent-green/0 group-hover:via-accent-green/50 transition-all"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-24 lg:py-32" id="about">
                    <div className="container mx-auto px-4">
                        <div className="mx-auto max-w-4xl rounded-lg border border-gray-800 bg-deep-charcoal/50 p-8 md:p-12 relative overflow-hidden">
                             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent-green to-transparent opacity-50"></div>
                             <div className="flex flex-col md:flex-row gap-10 items-center">
                                <div className="flex-1">
                                    <h2 className="text-3xl font-bold text-gray-100 text-glow-green mb-6">// Mission Directive: Data Sovereignty</h2>
                                    <div className="space-y-4 text-gray-400 leading-relaxed text-sm md:text-base font-mono">
                                        <p>&gt; <span className="text-accent-green font-bold">IDENTITY:</span> The Architects</p>
                                        <p>&gt; <span className="text-accent-green font-bold">OBJECTIVE:</span> Total Information Privacy</p>
                                        <p>
                                            In an era of unchecked surveillance and data commodification, Cipher was forged as a counter-measure. 
                                            We believe that communication is a fundamental human right that should remain ephemeral, encrypted, and untraceable.
                                        </p>
                                        <p>
                                            Our infrastructure is built on the principle of "Zero Knowledge." We facilitate the connection; we do not hold the keys.
                                            Once your session terminates, the digital reality of your conversation ceases to exist.
                                        </p>
                                    </div>
                                </div>
                                <div className="w-full md:w-1/3 flex justify-center">
                                    <div className="size-48 rounded-full border-2 border-dashed border-accent-green/30 flex items-center justify-center relative animate-spin-slow">
                                        <div className="absolute inset-2 rounded-full border border-accent-green/10"></div>
                                        <span className="material-symbols-outlined text-6xl text-accent-green/50">fingerprint</span>
                                    </div>
                                </div>
                             </div>
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-24 lg:py-32 bg-deep-charcoal" id="contact">
                    <div className="container mx-auto px-4 text-center">
                        <h2 className="text-3xl font-bold text-gray-100 text-glow-purple mb-12">// Establish Comms</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                            <div className="p-6 rounded-lg border border-accent-purple/20 bg-black/40 hover:border-accent-purple/50 transition-all group">
                                <span className="material-symbols-outlined text-4xl text-accent-purple mb-4 group-hover:text-glow-purple">mail</span>
                                <h3 className="text-xl font-bold text-gray-200 mb-2">Secure Frequency</h3>
                                <p className="text-gray-500 text-sm mb-4">For urgent inquiries and bug reports.</p>
                                <a href="mailto:huskey00@duck.com" className="text-accent-green hover:text-glow-green font-mono text-lg">&lt; huskey00@duck.com /&gt;</a>
                            </div>
                            <div className="p-6 rounded-lg border border-accent-purple/20 bg-black/40 hover:border-accent-purple/50 transition-all group">
                                <svg className="size-10 text-accent-purple mb-4 group-hover:text-glow-purple fill-current mx-auto" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" /></svg>
                                <h3 className="text-xl font-bold text-gray-200 mb-2">Source Code</h3>
                                <p className="text-gray-500 text-sm mb-4">Audit our protocols. Trust through transparency.</p>
                                <a href="https://github.com/Subhankar-Patra1/Cipher_Anonymous-Chats.git" target="_blank" rel="noopener noreferrer" className="text-accent-green hover:text-glow-green font-mono text-lg">&lt; github.com/Cipher /&gt;</a>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-20 border-y border-accent-green/10 bg-black/40">
                    <div className="container mx-auto px-4">
                        <div className="mx-auto max-w-3xl rounded-lg border border-accent-green/30 bg-black p-1 shadow-2xl">
                            <div className="flex items-center gap-2 bg-deep-charcoal px-4 py-2 border-b border-accent-green/20 rounded-t-lg">
                                <div className="size-3 rounded-full bg-red-500"></div>
                                <div className="size-3 rounded-full bg-yellow-500"></div>
                                <div className="size-3 rounded-full bg-green-500"></div>
                                <span className="ml-2 text-xs text-gray-400">guest@cipher-terminal:~</span>
                            </div>
                            <div ref={terminalContainerRef} className="h-64 overflow-y-auto p-4 font-mono text-sm" onClick={() => document.getElementById('terminal-input').focus()}>
                                {terminalHistory.map((line, i) => (
                                    <div key={i} className={`mb-1 ${
                                        line.type === 'user' ? 'text-gray-100' :
                                        line.type === 'error' ? 'text-red-400' :
                                        line.type === 'success' ? 'text-accent-green' :
                                        line.type === 'system' ? 'text-blue-400' :
                                        'text-accent-purple'
                                    }`}>
                                        {line.content}
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 border-t border-accent-green/20 bg-deep-charcoal/50 p-2">
                                <span className="text-accent-green pl-2">&gt;</span>
                                <form onSubmit={handleTerminalSubmit} className="w-full">
                                    <input 
                                        id="terminal-input"
                                        type="text" 
                                        value={terminalInput}
                                        onChange={(e) => setTerminalInput(e.target.value)}
                                        className="w-full bg-transparent border-none outline-none text-gray-100 font-mono text-sm focus:ring-0"
                                        autoComplete="off"

                                    />
                                </form>
                            </div>
                        </div>
                        <div className="mt-4 text-center">
                            <p className="text-sm text-gray-500">Try commands: <span className="text-accent-green">/status</span>, <span className="text-accent-purple">/about</span>, <span className="text-accent-green">/join</span></p>
                        </div>
                    </div>
                </section>

                <section className="py-20 sm:py-24 lg:py-32">
                    <div className="container mx-auto px-4">
                        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
                            <h2 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl md:text-5xl text-glow-purple">// Initiate Chat Protocols in Seconds.</h2>
                            <p className="text-base text-gray-400 sm:text-lg">No software downloads. No protracted authentication sequences. Only pure, streamlined, and secure data exchange. Generate your initial channel now and experience the differential.</p>
                            <button onClick={handleNavigation} className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-green px-6 text-base font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green decoration-0">
                                <span className="truncate">// Access Cipher Now</span>
                            </button>
                            <p className="text-sm text-gray-500">// Free, secure, and instantaneous.</p>
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-accent-green/20">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
                        <div className="flex items-center gap-3">
                            <div className="size-6 text-accent-green text-glow-green">
                                <img src="/logo.png" alt="Cipher Logo" className="size-6" />
                            </div>
                            <h2 className="text-lg font-bold text-gray-100 text-glow-green">Cipher</h2>
                        </div>
                        <nav className="flex flex-wrap justify-center gap-4 sm:gap-6">
                            <a className="text-sm text-gray-400 hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#features">Features</a>
                            <a className="text-sm text-gray-400 hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#about">About</a>
                            <a className="text-sm text-gray-400 hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#contact">Contact</a>
                        </nav>
                        <p className="text-sm text-gray-500">© 2025 Cipher. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
