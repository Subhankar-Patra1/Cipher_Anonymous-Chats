
// Utility to parse text and replace emoji characters with Apple-style emoji images

// Regex to match emojis (simplified version, might need a more robust one)
// Using a broad range for emojis
// Regex to match emojis including flags (RI pairs) and ZWJ sequences
const emojiRegex = /[\u{1F1E6}-\u{1F1FF}]{2}|(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F191}-\u{1F251}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}])(?:\u{200D}(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1F191}-\u{1F251}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]))*/gu;

// Mapping or function to get image URL
export const getAppleEmojiUrl = (emojiChar) => {
    // We need to convert char to hex codepoint
    // Dealing with surrogate pairs and complex emojis is tricky. 
    // For simplicity, we can try to use a library or a robust hex converter.
    
    // Simple hex conversion:
    const codePoints = [];
    for (const codePoint of emojiChar) {
        codePoints.push(codePoint.codePointAt(0).toString(16));
    }
    // Filter out variation selectors if needed (fe0f) usually
    // But basic emojis are simple. 
    // Let's use a simpler approach: codePointAt for the whole string if possible
    
    // Better approach: handle proper unicode split
    const points = [...emojiChar].map(c => c.codePointAt(0).toString(16));
    const hex = points.filter(h => h !== 'fe0f').join('-');
    
    return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`;
};

export const renderTextWithEmojis = (text, size = '1.25em') => {
    if (!text) return text;
    
    // If text is not a string, return as is
    if (typeof text !== 'string') return text;

    // Safety check if size passed is accidentally an index (from map) or event
    if (typeof size !== 'string') size = '1.25em';

    const parts = text.split(emojiRegex);
    const matches = text.match(emojiRegex);

    if (!matches) return text;

    return parts.reduce((acc, part, index) => {
        acc.push(part);
        if (matches[index]) {
            const emojiChar = matches[index];
            acc.push(
                <img 
                    key={`emoji-${index}`}
                    src={getAppleEmojiUrl(emojiChar)} 
                    alt={emojiChar} 
                    className="inline-block align-middle mx-[0.05em] select-none pointer-events-none object-contain" 
                    style={{ width: size, height: size, verticalAlign: 'middle' }}
                    draggable="false"
                    onError={(e) => {
                        e.target.style.display = 'none';
                        // Fallback to text node if image fails
                        e.target.parentNode.insertBefore(document.createTextNode(emojiChar), e.target);
                    }}
                />
            );
        }
        return acc;
    }, []);
};

export const renderTextWithEmojisToHtml = (text) => {
    if (!text) return '';
    if (typeof text !== 'string') return String(text);

    const parts = text.split(emojiRegex);
    const matches = text.match(emojiRegex);

    if (!matches) return text;

    let html = '';
    parts.forEach((part, index) => {
        html += part;
        if (matches[index]) {
            const emojiChar = matches[index];
            const url = getAppleEmojiUrl(emojiChar);
            // Updated class to match ProfilePanel styling needs
            html += `<img src="${url}" alt="${emojiChar}" class="inline-block align-middle mx-[0.05em] select-none pointer-events-none object-contain" style="width: 1.25em; height: 1.25em; vertical-align: middle;" draggable="false" />`;
        }
    });
    return html;
};
