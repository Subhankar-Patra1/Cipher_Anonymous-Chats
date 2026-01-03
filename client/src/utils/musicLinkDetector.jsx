import YouTubePreview, { extractYouTubeId } from '../components/YouTubePreview';
import SpotifyPreview, { extractSpotifyInfo } from '../components/SpotifyPreview';

/**
 * Detect music links in text content
 * Returns array of detected music links with their type
 */
export function detectMusicLinks(text) {
    if (!text) return [];
    
    const links = [];
    
    // YouTube patterns
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/gi;
    let match;
    
    while ((match = youtubeRegex.exec(text)) !== null) {
        links.push({
            type: 'youtube',
            url: match[0],
            videoId: match[1]
        });
    }
    
    // Spotify patterns
    const spotifyRegex = /https?:\/\/open\.spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/gi;
    
    while ((match = spotifyRegex.exec(text)) !== null) {
        links.push({
            type: 'spotify',
            url: match[0],
            contentType: match[1],
            id: match[2]
        });
    }
    
    return links;
}

/**
 * Check if text contains any music links
 */
export function hasMusicLinks(text) {
    return detectMusicLinks(text).length > 0;
}

/**
 * Render music preview components for detected links
 */
export function renderMusicPreviews(text, isMe) {
    const links = detectMusicLinks(text);
    
    if (links.length === 0) return null;
    
    return (
        <div className="music-previews flex flex-col gap-2 w-full">
            {links.map((link, index) => {
                if (link.type === 'youtube') {
                    return (
                        <YouTubePreview 
                            key={`youtube-${index}-${link.videoId}`}
                            url={link.url}
                            videoId={link.videoId}
                            isMe={isMe}
                        />
                    );
                }
                
                if (link.type === 'spotify') {
                    return (
                        <SpotifyPreview 
                            key={`spotify-${index}-${link.id}`}
                            url={link.url}
                            isMe={isMe}
                        />
                    );
                }
                
                return null;
            })}
        </div>
    );
}

export { extractYouTubeId, extractSpotifyInfo };
