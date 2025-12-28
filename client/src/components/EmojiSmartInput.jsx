import React, { useRef, useEffect, useState } from 'react';
import ContentEditable from 'react-contenteditable';
import { renderTextWithEmojisToHtml } from '../utils/emojiRenderer';

const EmojiSmartInput = ({ 
    value, 
    onChange, 
    placeholder, 
    className, 
    maxLength, 
    autoFocus, 
    readOnly,
    onFocus,
    onBlur,
    onEmojiToggle // Optional extra button or handler
}) => {
    const contentEditableRef = useRef(null);
    const [html, setHtml] = useState('');

    // Sync value prop to internal HTML
    // We only update if the plain text content differs to avoid cursor jumps
    useEffect(() => {
        const currentText = contentEditableRef.current 
            ? contentEditableRef.current.innerText.replace(/\n/g, '') // ContentEditable adds \n sometimes
            : '';
            
        if (value !== currentText && value !== undefined) {
             setHtml(renderTextWithEmojisToHtml(value));
        } else if (value === '' && html !== '') {
             setHtml('');
        }
    }, [value]);

    const handleChange = (evt) => {
        const rawHtml = evt.target.value;
        // Parse HTML to preserve emoji characters from alt tags
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawHtml;
        
        // Replace all emoji images with their alt text
        const images = tempDiv.getElementsByTagName('img');
        while(images.length > 0) {
            const img = images[0];
            const alt = img.getAttribute('alt') || '';
            const textNode = document.createTextNode(alt);
            img.parentNode.replaceChild(textNode, img);
        }

        let text = tempDiv.innerText || tempDiv.textContent || '';
        
        // Removing zero-width spaces or other artifacts if needed
        // text = text.replace(/[\u200B]/g, '');

        if (maxLength && text.length > maxLength) {
            text = text.slice(0, maxLength);
        }
        
        // Only trigger change if text is distinct (avoid loops, though useEffect guards this)
        onChange(text);
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    };

    // Keep focus logic - when value updates externally (emoji insert), we want to ensure we're at the end?
    // Or at least not focused? 
    // Actually, preserving selection is hard without robust cursor tracking. 
    // Basic approach: If duplicate focus events occur, it's fine.
    
    return (
        <div className="relative w-full">
            <ContentEditable
                innerRef={contentEditableRef}
                html={html}
                disabled={readOnly}
                onChange={handleChange}
                onPaste={handlePaste}
                onFocus={onFocus}
                onBlur={onBlur}
                className={`outline-none whitespace-pre-wrap break-words ${className} ${!html && 'empty'}`}
                tagName="div"
                // Remove autoFocus from here if controlled externally to avoid fighting
                // But we passed it as prop.
            />
            {/* Placeholder Overlay */}
            {!html && placeholder && (
                <div className="absolute top-0 left-0 h-full w-full pointer-events-none text-slate-400 dark:text-slate-500 flex items-center px-4">
                    {placeholder}
                </div>
            )}
        </div>
    );
};

export default EmojiSmartInput;
