
import emojiRegex from 'emoji-regex';

// Helper to convert emoji to hex code, stripping VS16 (fe0f) for CDN compatibility
export const toHex = (emoji) => {
    return Array.from(emoji)
        .map(c => c.codePointAt(0).toString(16))
        .filter(hex => hex !== 'fe0f') // Strip variation selector 16
        .join('-');
};

// Convert text with emojis to HTML string with images
export const textToHtml = (text) => {
    if (!text) return '';
    const regex = emojiRegex();
    return text.replace(regex, (match) => {
        const hex = toHex(match);
        return `<img src="https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png" alt="${match}" class="w-6 h-6 inline-block align-middle mb-[3px]" style="margin: 0 1px;" draggable="false" />`;
    });
};

// ... (previous imports and helpers)

// Main function to linkify text and render emojis
export const linkifyText = (text, searchTerm = '') => {
    if (!text) return null;

    // Regex for mentions: @[Name](user:ID)
    const mentionRegex = /@\[(.*?)\]\(user:(\d+)\)/g;
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    
    // We need to parse everything in order. 
    // Strategy: Split by Mentions first, then process chunks for URLs and Emojis.

    const parts = [];
    let globalKey = 0;

    // Helper process generic text (URLs + Emojis + Search Highlight)
    // NOTE: This is formerly the main body logic, extracted to reusable function
    const processGenericText = (genericText) => {
        if (!genericText) return;
        
        let localLastIndex = 0;
        let match;
        
        // Find URLs in this chunk
        while ((match = urlRegex.exec(genericText)) !== null) {
            const url = match[0];
            const start = match.index;

            // Before URL: Emojis + Search
            if (start > localLastIndex) {
                 processTextSegment(genericText.slice(localLastIndex, start));
            }

            let href = url;
            if (href.startsWith("www.")) {
                href = "https://" + href;
            }

            parts.push(
                <a
                    key={globalKey++}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-slate-200 underline break-words decoration-violet-400 decoration-1 hover:decoration-2"
                >
                    {url}
                </a>
            );

            localLastIndex = start + url.length;
        }

        // Tail after last URL
        if (localLastIndex < genericText.length) {
            processTextSegment(genericText.slice(localLastIndex));
        }
    };
    
    const highlightText = (content) => {
        if (!content) return null;
        if (!searchTerm || !searchTerm.trim()) return content;

        // Escape regex special chars in searchTerm
        const safeTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${safeTerm})`, 'gi');
        const theseParts = content.split(regex);
        
        return theseParts.map((part, i) => {
            if (part.toLowerCase() === searchTerm.toLowerCase()) {
                return (
                     <mark key={`hl-${globalKey++}`} className="bg-yellow-300 dark:bg-yellow-500/50 text-slate-900 dark:text-white rounded-sm px-0.5 mx-0.5 font-semibold">
                        {part}
                    </mark>
                );
            }
            return part;
        });
    };

    const processTextSegment = (segment) => {
        if (!segment) return;
        const regex = emojiRegex();
        let lastEmojiIndex = 0;
        let emojiMatch;

        while ((emojiMatch = regex.exec(segment)) !== null) {
            const emojiChar = emojiMatch[0];
            const index = emojiMatch.index;

            if (index > lastEmojiIndex) {
               const sub = segment.substring(lastEmojiIndex, index);
               const highlighted = highlightText(sub);
               if (Array.isArray(highlighted)) {
                   highlighted.forEach(h => parts.push(<span key={globalKey++}>{h}</span>));
               } else {
                   parts.push(<span key={globalKey++}>{highlighted}</span>);
               }
            }

            const hex = toHex(emojiChar);
            parts.push(
                <img
                    key={globalKey++}
                    src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`}
                    alt={emojiChar}
                    className="w-5 h-5 inline-block align-text-bottom mx-[1px] select-none"
                    draggable="false" 
                    loading="lazy"
                    onError={(e) => {
                         e.currentTarget.style.display = 'none';
                         const span = document.createElement('span');
                         span.textContent = emojiChar;
                         if (e.currentTarget.parentNode) {
                             e.currentTarget.parentNode.insertBefore(span, e.currentTarget);
                         }
                    }}
                />
            );
            lastEmojiIndex = regex.lastIndex;
        }

        if (lastEmojiIndex < segment.length) {
            const sub = segment.substring(lastEmojiIndex);
            const highlighted = highlightText(sub);
             if (Array.isArray(highlighted)) {
                   highlighted.forEach(h => parts.push(<span key={globalKey++}>{h}</span>));
               } else {
                   parts.push(<span key={globalKey++}>{highlighted}</span>);
               }
        }
    };


    // --- Main Loop: Split by Mentions ---
    let mainMatch;
    let mainLastIndex = 0;

    while ((mainMatch = mentionRegex.exec(text)) !== null) {
        const fullMatch = mainMatch[0]; // @[Name](user:123)
        const name = mainMatch[1];
        const userId = mainMatch[2];
        const start = mainMatch.index;

        // Process text BEFORE mention
        if (start > mainLastIndex) {
            processGenericText(text.slice(mainLastIndex, start));
        }

        // Render Mention
        // We use dangerouslySetInnerHTML for name to render emojis insde name correctly (since name comes from processed source or just raw text)
        // Actually, name here is raw text "Name 🕶️". We can use textToHtml on it.
        const nameHtml = textToHtml(name);
        
        parts.push(
            <span 
                key={globalKey++} 
                className="text-violet-600 dark:text-violet-300 font-bold bg-violet-50 dark:bg-violet-900/40 rounded px-1.5 py-0.5 mx-0.5 inline-flex items-center gap-0.5 border border-violet-100 dark:border-violet-700/50"
                title={`User ID: ${userId}`}
            >
                @<span dangerouslySetInnerHTML={{ __html: nameHtml }} className="inline-flex items-center gap-0.5" />
            </span>
        );

        mainLastIndex = start + fullMatch.length;
    }

    // Process TAIL
    if (mainLastIndex < text.length) {
        processGenericText(text.slice(mainLastIndex));
    }

    return parts;
};
