import React, { useState, useEffect } from 'react';

/**
 * LocationPicker - Modal for getting and sending user's location
 * Uses browser's Geolocation API
 */
export default function LocationPicker({ isOpen, onClose, onSend }) {
    const [location, setLocation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [address, setAddress] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Reset states to ensure fresh fetch
            setLocation(null);
            setAddress('');
            setError(null);
            getCurrentLocation();
        }
    }, [isOpen]);

    const getCurrentLocation = () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser');
            return;
        }

        setLoading(true);
        setError(null);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setLocation({ latitude, longitude });
                
                // Try to get address via reverse geocoding
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                    );
                    const data = await res.json();
                    if (data.display_name) {
                        setAddress(data.display_name);
                    }
                } catch (e) {
                    console.log('Could not get address:', e);
                }
                
                setLoading(false);
            },
            (err) => {
                console.warn('Geolocation error:', err.message);
                // Fallback to IP-based location
                getIpLocation(err);
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
        );
    };

    const getIpLocation = async (originalError) => {
        try {
            const res = await fetch('https://ipapi.co/json/');
            if (!res.ok) throw new Error('IP API failed');
            const data = await res.json();
            
            if (data.latitude && data.longitude) {
                setLocation({ latitude: data.latitude, longitude: data.longitude });
                setAddress(`${data.city}, ${data.region}, ${data.country_name} (Approx. based on IP)`);
                setLoading(false);
            } else {
                throw new Error('Invalid IP data');
            }
        } catch (ipErr) {
            console.error('IP Fallback failed:', ipErr);
            // Show original error if fallback fails
            let msg = 'Could not get your location. Please try again.';
            if (originalError.code === 1) msg = 'Location permission denied. Please enable location access.';
            else if (originalError.code === 2) msg = 'Location unavailable. Check your GPS/network.';
            else if (originalError.code === 3) msg = 'Location request timed out.';
            setError(msg);
            setLoading(false);
        }
    };

    const handleSend = () => {
        if (location) {
            onSend({
                latitude: location.latitude,
                longitude: location.longitude,
                address: address || null
            });
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 fade-in duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-500">location_on</span>
                        Share Location
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-slate-500">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-4">
                            <div className="w-12 h-12 rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-red-500 animate-spin" />
                            <p className="text-slate-500 dark:text-slate-400">Getting your location...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-4">
                            <span className="material-symbols-outlined text-4xl text-red-500">location_off</span>
                            <p className="text-red-500 text-center">{error}</p>
                            <button
                                onClick={getCurrentLocation}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : location ? (
                        <div className="space-y-4">
                            {/* Map Preview */}
                            <div className="relative w-full h-48 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                                <img 
                                    src={`https://static-maps.yandex.ru/1.x/?lang=en-US&ll=${location.longitude},${location.latitude}&z=15&l=map&size=400,200&pt=${location.longitude},${location.latitude},pm2rdm`}
                                    alt="Map preview"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        // Fallback to a simple marker display if map fails
                                        e.target.style.display = 'none';
                                    }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <div className="w-8 h-8 bg-red-500 rounded-full shadow-lg flex items-center justify-center animate-bounce">
                                        <span className="material-symbols-outlined text-white text-lg">location_on</span>
                                    </div>
                                </div>
                            </div>

                            {/* Location Details */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="material-symbols-outlined text-slate-400 text-[18px]">my_location</span>
                                    <span className="text-slate-600 dark:text-slate-300 font-mono text-xs">
                                        {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                                    </span>
                                </div>
                                {address && (
                                    <div className="flex items-start gap-2 text-sm">
                                        <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">pin_drop</span>
                                        <span className="text-slate-600 dark:text-slate-300 text-xs line-clamp-2">
                                            {address}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Send Button */}
                            <button
                                onClick={handleSend}
                                className="w-full py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-semibold rounded-xl hover:from-red-600 hover:to-rose-600 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined">send</span>
                                Send Location
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
