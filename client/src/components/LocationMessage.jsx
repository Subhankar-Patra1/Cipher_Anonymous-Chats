import React from 'react';

/**
 * LocationMessage - Renders a location message with map preview
 * Click to open in Google Maps
 */
export default function LocationMessage({ latitude, longitude, address, isMe }) {
    const openInMaps = () => {
        window.open(
            `https://www.google.com/maps?q=${latitude},${longitude}`,
            '_blank'
        );
    };

    return (
        <div 
            className="cursor-pointer group/map"
            onClick={openInMaps}
            title="Open in Google Maps"
        >
            {/* Map Preview */}
            <div className="relative w-[250px] h-[150px] rounded-lg overflow-hidden border border-white/20 shadow-lg">
                <img 
                    src={`https://static-maps.yandex.ru/1.x/?lang=en-US&ll=${longitude},${latitude}&z=15&l=map&size=250,150&pt=${longitude},${latitude},pm2rdm`}
                    alt="Location"
                    className="w-full h-full object-cover transition-transform group-hover/map:scale-105"
                    onError={(e) => {
                        // Fallback styling if map fails
                        e.target.parentElement.classList.add('bg-slate-200', 'dark:bg-slate-700');
                    }}
                />
                
                {/* Overlay with coordinates */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-3">
                    <div className="flex items-center gap-1.5 text-white">
                        <span className="material-symbols-outlined text-red-400 text-[18px] drop-shadow-lg">location_on</span>
                        <span className="text-xs font-medium drop-shadow-lg">
                            {latitude.toFixed(4)}, {longitude.toFixed(4)}
                        </span>
                    </div>
                </div>

                {/* Open button on hover */}
                <div className="absolute top-2 right-2 opacity-0 group-hover/map:opacity-100 transition-opacity">
                    <div className="bg-white dark:bg-slate-800 rounded-full w-8 h-8 flex items-center justify-center shadow-lg">
                        <span className="material-symbols-outlined text-[16px] text-slate-700 dark:text-slate-200">open_in_new</span>
                    </div>
                </div>
            </div>

            {/* Address if available */}
            {address && (
                <p className={`text-xs mt-2 mb-1 px-1 max-w-[250px] line-clamp-2 ${
                    isMe ? 'text-violet-200' : 'text-slate-500 dark:text-slate-400'
                }`}>
                    {address}
                </p>
            )}
        </div>
    );
}
