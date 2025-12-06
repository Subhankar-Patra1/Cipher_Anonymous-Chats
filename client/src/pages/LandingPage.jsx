import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
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

        return () => {
             hackerWords.forEach(word => {
                word.removeEventListener('mouseover', handleMouseOver);
                clearInterval(word.interval);
            });
        };
    }, []);

    return (
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden bg-deep-charcoal font-mono text-gray-200 antialiased scanline">
            <div className="grid-background"></div>

            <header className="sticky top-0 z-50 w-full bg-deep-charcoal/80 backdrop-blur-sm border-b border-accent-green/20">
                <div className="container mx-auto px-4">
                    <div className="flex h-20 items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-8 text-accent-green text-glow-green">
                                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" fill="currentColor"></path>
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-gray-100 text-glow-green">ChatRooms</h2>
                        </div>
                        <nav className="hidden items-center gap-8 md:flex">
                            <a className="text-sm font-medium hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#features">Features</a>
                            <a className="text-sm font-medium hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#how-it-works">How It Works</a>
                            <a className="text-sm font-medium hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#security">Security</a>
                        </nav>
                        <Link to="/auth" className="flex h-10 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-full bg-accent-green px-4 text-sm font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green-sm decoration-0">
                            <span className="truncate">Get Started</span>
                        </Link>
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
                                <Link to="/auth" className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-green px-6 text-base font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green decoration-0">
                                    <span className="truncate">// Get Started</span>
                                </Link>
                                <Link to="/auth" className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-purple/20 border border-accent-purple px-6 text-base font-bold text-white transition-colors hover:bg-accent-purple/40 text-glow-purple decoration-0">
                                    <span className="truncate">// Create a Room</span>
                                </Link>
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
                            <h1 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl md:text-5xl text-glow-green">
                                // Core Protocols for Seamless Communication
                            </h1>
                            <p className="mx-auto max-w-2xl text-base text-gray-400 sm:text-lg">
                                &gt; ChatRooms is engineered for rapid, secure, and intuitive data exchange. Observe our unique functionalities.
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
                                        <Link to="/auth" className="flex h-10 w-full cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-green px-4 text-sm font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green decoration-0">
                                            <span className="truncate">// Copy Protocol Key &amp; Access Link</span>
                                        </Link>
                                    </div>
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

                <section className="py-20 sm:py-24 lg:py-32">
                    <div className="container mx-auto px-4">
                        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
                            <h2 className="text-3xl font-bold tracking-tighter text-gray-100 sm:text-4xl md:text-5xl text-glow-purple">// Initiate Chat Protocols in Seconds.</h2>
                            <p className="text-base text-gray-400 sm:text-lg">No software downloads. No protracted authentication sequences. Only pure, streamlined, and secure data exchange. Generate your initial channel now and experience the differential.</p>
                            <Link to="/auth" className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center overflow-hidden rounded-md bg-accent-green px-6 text-base font-bold text-deep-charcoal transition-opacity hover:opacity-90 text-glow-green decoration-0">
                                <span className="truncate">// Access ChatRooms Now</span>
                            </Link>
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
                                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M36.7273 44C33.9891 44 31.6043 39.8386 30.3636 33.69C29.123 39.8386 26.7382 44 24 44C21.2618 44 18.877 39.8386 17.6364 33.69C16.3957 39.8386 14.0109 44 11.2727 44C7.25611 44 4 35.0457 4 24C4 12.9543 7.25611 4 11.2727 4C14.0109 4 16.3957 8.16144 17.6364 14.31C18.877 8.16144 21.2618 4 24 4C26.7382 4 29.123 8.16144 30.3636 14.31C31.6043 8.16144 33.9891 4 36.7273 4C40.7439 4 44 12.9543 44 24C44 35.0457 40.7439 44 36.7273 44Z" fill="currentColor"></path></svg>
                            </div>
                            <h2 className="text-lg font-bold text-gray-100 text-glow-green">ChatRooms</h2>
                        </div>
                        <nav className="flex flex-wrap justify-center gap-4 sm:gap-6">
                            <a className="text-sm text-gray-400 hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#features">Features</a>
                            <a className="text-sm text-gray-400 hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#">About</a>
                            <a className="text-sm text-gray-400 hover:text-accent-green text-glow-green/50 hover:text-glow-green" href="#">Contact</a>
                        </nav>
                        <p className="text-sm text-gray-500">© 2025 ChatRooms. All rights reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
