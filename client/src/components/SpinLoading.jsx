export default function SpinLoading() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm transition-opacity duration-300">
            <div className="relative flex flex-col items-center">
                {/* Outer Glow */}
                <div className="absolute inset-0 bg-violet-600/30 rounded-full blur-xl animate-pulse"></div>
                
                {/* Spinner */}
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 border-4 border-slate-700/50 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-t-violet-500 border-r-indigo-500 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                </div>

                {/* Loading Text */}
                <div className="mt-8 text-slate-300 font-medium tracking-wider animate-pulse flex items-center gap-1">
                    <span>ENTERING DASHBOARD</span>
                    <span className="animate-bounce delay-100">.</span>
                    <span className="animate-bounce delay-200">.</span>
                    <span className="animate-bounce delay-300">.</span>
                </div>
            </div>
        </div>
    );
}
