
import { useState } from 'react';
import emojiRegex from 'emoji-regex';
import { linkToBigEmoji, isSingleEmoji, splitEmojis } from './animatedEmojiMap';
import BigAnimatedEmoji from '../components/BigAnimatedEmoji';

// Helper to check if text is only emojis (1-3)
const isOnlyEmojis = (text) => {
    if (!text) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    
    // Use the same logic as isSingleEmoji but allow analysis
    const regex = emojiRegex();
    const matches = [...trimmed.matchAll(regex)];
    const emojiText = matches.map(m => m[0]).join('');
    
    // Check if text is ONLY emojis (no other characters)
    return emojiText.length > 0 && trimmed.replace(regex, '').trim() === '' && matches.length <= 3;
};

// Get emoji size class based on count
const getEmojiSize = (count) => {
    if (count === 1) return { fontSize: '80px', imgSize: 128 };
    if (count === 2) return { fontSize: '60px', imgSize: 96 };
    return { fontSize: '48px', imgSize: 72 }; // 3 emojis
};

// Spoiler component - reveals ONCE on click (Telegram behavior)
// Now with dynamic emoji sizing for emoji-only content
const SpoilerText = ({ children, keyProp, rawContent, disableBigEmoji }) => {
    const [revealed, setRevealed] = useState(false);
    
    // Check if this is emoji-only spoiler content
    const isBigEmoji = !disableBigEmoji && rawContent && isOnlyEmojis(rawContent);
    const emojis = isBigEmoji ? splitEmojis(rawContent.trim()) : [];
    const emojiCount = emojis.length;
    const sizeConfig = getEmojiSize(emojiCount);
    
    return (
        <span
            key={keyProp}
            className={`spoiler-message ${revealed ? 'spoiler-revealed' : ''} ${isBigEmoji ? 'inline-flex items-center gap-1' : ''}`}
            style={isBigEmoji ? { padding: '4px 8px', borderRadius: '12px' } : {}}
            onClick={(e) => {
                e.stopPropagation();
                if (!revealed) setRevealed(true); // Only reveal, never re-hide
            }}
        >
            {isBigEmoji ? (
                // Render big emojis with dynamic sizing
                <span className="spoiler-content transition-opacity duration-200">
                    {emojis.map((emoji, idx) => {
                        const animatedUrl = linkToBigEmoji(emoji);
                        return animatedUrl ? (
                            <BigAnimatedEmoji
                                key={idx}
                                url={animatedUrl}
                                alt={emoji}
                                size={sizeConfig.imgSize}
                                autoPlay={revealed}
                            />
                        ) : (
                            <img
                                key={idx}
                                src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${toHex(emoji)}.png`}
                                alt={emoji}
                                className="select-none object-contain"
                                style={{
                                    width: sizeConfig.imgSize + 'px',
                                    height: sizeConfig.imgSize + 'px',
                                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))'
                                }}
                                draggable="false"
                            />
                        );
                    })}
                </span>
            ) : (
                // Normal spoiler content
                <span className="spoiler-content transition-opacity duration-200">{children}</span>
            )}
        </span>
    );
};

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
        return `<img src="https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png" alt="${match}" class="w-[1.5em] h-[1.45em] inline-block select-none pointer-events-none" style="vertical-align: -0.25em; margin: 0 1px;" draggable="false" />`;
    });
};

// ... (previous imports and helpers)

// Main function to linkify text and render emojis
export const linkifyText = (text, searchTerm = '', linkClass, options = {}) => {
    if (!text) return null;

    // Regex for mentions: @[Name](user:ID)
    const mentionRegex = /@\[(.*?)\]\(user:(\d+)\)/g;
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
    
    const parts = [];
    let globalKey = 0;

    // 1. Process Spoilers: ||text||
    // This is the new top-level processor for text segments
    const processSpoilers = (segment, outputArray) => {
        if (!segment) return;

        const spoilerRegex = /\|\|(.+?)\|\|/g;
        let match;
        let lastIndex = 0;

        while ((match = spoilerRegex.exec(segment)) !== null) {
            const before = segment.slice(lastIndex, match.index);
            const spoilerContent = match[1];

            // Process text before spoiler
            processUrls(before, outputArray);

            // Process content INSIDE spoiler (linkify it)
            const contentElements = [];
            processUrls(spoilerContent, contentElements); // Recurse for links inside

            outputArray.push(
                <SpoilerText keyProp={globalKey++} rawContent={spoilerContent} disableBigEmoji={options.disableBigEmoji}>
                    {contentElements.length > 0 ? contentElements : spoilerContent}
                </SpoilerText>
            );

            lastIndex = spoilerRegex.lastIndex;
        }

        // Process remaining text
        if (lastIndex < segment.length) {
            processUrls(segment.slice(lastIndex), outputArray);
        }
    };

    // 2. Process URLs (formerly processGenericText)
    const processUrls = (segment, outputArray) => {
        if (!segment) return;
        
        let localLastIndex = 0;
        let match;
        
        // Find URLs in this chunk
        while ((match = urlRegex.exec(segment)) !== null) {
            const url = match[0];
            const start = match.index;

            // Before URL: Process Bold/Base text
            if (start > localLastIndex) {
                 processBoldSection(segment.slice(localLastIndex, start), outputArray);
            }

            let href = url;
            if (href.startsWith("www.")) {
                href = "https://" + href;
            }

            const defaultLinkClass = "text-white hover:text-slate-200 underline break-words decoration-violet-400 decoration-1 hover:decoration-2";
            const finalLinkClass = linkClass !== undefined ? linkClass : defaultLinkClass;

            outputArray.push(
                <a
                    key={globalKey++}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={finalLinkClass}
                    onClick={(e) => e.stopPropagation()} // Prevent triggering spoiler reveal if clicked directly
                >
                    {url}
                </a>
            );

            localLastIndex = start + url.length;
        }

        // Tail after last URL
        if (localLastIndex < segment.length) {
            processBoldSection(segment.slice(localLastIndex), outputArray);
        }
    };

    // 3. Process Bold
    const processBoldSection = (segment, outputArray) => {
        if (!segment) return;
        
        const boldRegex = /\*\*(?!\s)([^*]+?)(?<!\s)\*\*|\*(?!\s)([^*]+?)(?<!\s)\*/g;
        let match;
        let lastIndex = 0;
        
        while ((match = boldRegex.exec(segment)) !== null) {
            const before = segment.slice(lastIndex, match.index);
            const content = match[1] || match[2];
            
            if (before) {
                processEmojisAndHighlight(before, outputArray);
            }
            
            outputArray.push(
                <strong key={globalKey++} className="font-bold">
                    {processEmojisInline(content)}
                </strong>
            );
            
            lastIndex = boldRegex.lastIndex;
        }
        
        if (lastIndex < segment.length) {
            processEmojisAndHighlight(segment.slice(lastIndex), outputArray);
        }
    };
    
    // 4. Helper to process emojis and return inline elements (for inside bold)
    const processEmojisInline = (text) => {
        if (!text) return null;
        const regex = emojiRegex();
        const result = [];
        let lastIndex = 0;
        let match;
        
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                result.push(text.substring(lastIndex, match.index));
            }
            const hex = toHex(match[0]);
            result.push(
                <img
                    key={globalKey++}
                    src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`}
                    alt={match[0]}
                    className="w-[1.45em] h-[1.45em] inline-block select-none pointer-events-none"
                    style={{ verticalAlign: '-0.25em', margin: '0 1px' }}
                    draggable="false" 
                    loading="lazy"
                />
            );
            lastIndex = regex.lastIndex;
        }
        
        if (lastIndex < text.length) {
            result.push(text.substring(lastIndex));
        }
        
        return result.length > 0 ? result : text;
    };
    
    // 5. Process Emojis and Highlight (Base Level)
    const processEmojisAndHighlight = (text, outputArray) => {
        if (!text) return;
        const regex = emojiRegex();
        let lastEmojiIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
             const index = match.index;
             const emojiChar = match[0];

            if (index > lastEmojiIndex) {
               const sub = text.substring(lastEmojiIndex, index);
               const highlighted = highlightText(sub);
               if (Array.isArray(highlighted)) {
                   highlighted.forEach(h => outputArray.push(<span key={globalKey++}>{h}</span>));
               } else {
                   outputArray.push(<span key={globalKey++}>{highlighted}</span>);
               }
            }

            const hex = toHex(emojiChar);
            outputArray.push(
                <img
                    key={globalKey++}
                    src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`}
                    alt={emojiChar}
                    className="w-[1.45em] h-[1.45em] inline-block select-none pointer-events-none"
                    style={{ verticalAlign: '-0.25em', margin: '0 1px' }}
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

        if (lastEmojiIndex < text.length) {
            const sub = text.substring(lastEmojiIndex);
            const highlighted = highlightText(sub);
            if (Array.isArray(highlighted)) {
                   highlighted.forEach(h => outputArray.push(<span key={globalKey++}>{h}</span>));
            } else {
                   outputArray.push(<span key={globalKey++}>{highlighted}</span>);
            }
        }
    };

    const highlightText = (content) => {
        if (!content) return null;
        if (!searchTerm || !searchTerm.trim()) return content;

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
            // New entry point: processSpoilers
            processSpoilers(text.slice(mainLastIndex, start), parts);
        }

        // Render Mention
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
        processSpoilers(text.slice(mainLastIndex), parts);
    }

    return parts;
};
