
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

// Main function to linkify text and render emojis
export const linkifyText = (text) => {
    if (!text) return null;

    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    const parts = [];
    let lastIndex = 0;
    let match;
    let globalKey = 0;

    // Inner helper to process text segments for emojis
    const processTextSegment = (segment) => {
        if (!segment) return;
        const regex = emojiRegex();
        let lastEmojiIndex = 0;
        let emojiMatch;

        while ((emojiMatch = regex.exec(segment)) !== null) {
            const emojiChar = emojiMatch[0];
            const index = emojiMatch.index;

            if (index > lastEmojiIndex) {
               parts.push(<span key={globalKey++}>{segment.substring(lastEmojiIndex, index)}</span>);
            }

            const hex = toHex(emojiChar);
            parts.push(
                <img
                    key={globalKey++}
                    src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`}
                    alt={emojiChar}
                    className="w-5 h-5 inline-block align-middle mb-[3px] mx-[1px]"
                    draggable="false"
                    loading="lazy"
                    onError={(e) => {
                         // Fallback to native text if image fails
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
            parts.push(<span key={globalKey++}>{segment.substring(lastEmojiIndex)}</span>);
        }
    };

    while ((match = urlRegex.exec(text)) !== null) {
        const url = match[0];
        const start = match.index;

        if (start > lastIndex) {
            processTextSegment(text.slice(lastIndex, start));
        }

        let href = url;
        if (href.startsWith("www.")) {
            href = "https://" + href;
        }

        // We use a clean structure for links
        parts.push(
            <a
                key={globalKey++}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-300 hover:text-violet-200 underline break-words"
            >
                {url}
            </a>
        );

        lastIndex = start + url.length;
    }

    if (lastIndex < text.length) {
        processTextSegment(text.slice(lastIndex));
    }

    return parts;
};
