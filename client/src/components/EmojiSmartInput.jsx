import React, { useRef, useEffect, useState, useCallback } from 'react';
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
    onEmojiToggle
}) => {
    const editorRef = useRef(null);
    const lastValueRef = useRef(value || '');
    const [isEmpty, setIsEmpty] = useState(!value || value.length === 0);

    // Extract plain text from element (handles both text nodes and emoji images)
    const extractTextFromElement = useCallback((element) => {
        if (!element) return '';
        
        let text = '';
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            } else if (node.nodeName === 'IMG') {
                text += node.getAttribute('alt') || '';
            } else if (node.nodeType === Node.ELEMENT_NODE && node.nodeName !== 'BR') {
                for (const child of node.childNodes) {
                    walk(child);
                }
            }
        };
        walk(element);
        return text;
    }, []);

    // Sync external value changes to DOM (only when value changes externally)
    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;
        
        const currentDomText = extractTextFromElement(el);
        
        // Only update DOM if value changed externally (not from user input)
        if (value !== currentDomText && value !== lastValueRef.current) {
            el.innerHTML = renderTextWithEmojisToHtml(value || '');
            lastValueRef.current = value || '';
        }
        
        setIsEmpty(!value || value.length === 0);
    }, [value, extractTextFromElement]);

    // Handle all input changes
    const handleInput = useCallback(() => {
        const el = editorRef.current;
        if (!el) return;
        
        let text = extractTextFromElement(el);
        
        // Enforce max length
        if (maxLength) {
            const graphemes = [...text];
            if (graphemes.length > maxLength) {
                text = graphemes.slice(0, maxLength).join('');
                // Update DOM to reflect truncation
                const sel = window.getSelection();
                el.innerHTML = renderTextWithEmojisToHtml(text);
                // Move cursor to end
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        
        setIsEmpty(text.length === 0);
        lastValueRef.current = text;
        onChange(text);
    }, [extractTextFromElement, maxLength, onChange]);

    // Handle paste
    const handlePaste = useCallback((e) => {
        e.preventDefault();
        const pastedText = e.clipboardData.getData('text/plain');
        
        if (maxLength) {
            const currentLength = [...(lastValueRef.current || '')].length;
            const remainingChars = maxLength - currentLength;
            if (remainingChars <= 0) return;
            
            const truncatedPaste = [...pastedText].slice(0, remainingChars).join('');
            document.execCommand('insertText', false, truncatedPaste);
        } else {
            document.execCommand('insertText', false, pastedText);
        }
        
        // Trigger input handler after paste
        setTimeout(handleInput, 0);
    }, [maxLength, handleInput]);

    // Handle keydown - block input at limit
    const handleKeyDown = useCallback((e) => {
        // Always allow control keys
        const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab', 'Escape'];
        if (allowedKeys.includes(e.key)) return;
        
        // Allow modifier combos (Ctrl+A, Ctrl+C, etc.)
        if (e.ctrlKey || e.metaKey) return;
        
        // Block character input if at limit
        if (maxLength && e.key.length === 1) {
            const currentLength = [...(lastValueRef.current || '')].length;
            if (currentLength >= maxLength) {
                e.preventDefault();
            }
        }
    }, [maxLength]);

    // Auto focus
    useEffect(() => {
        if (autoFocus && editorRef.current) {
            editorRef.current.focus();
        }
    }, [autoFocus]);

    // Initial render
    useEffect(() => {
        const el = editorRef.current;
        if (el && value) {
            el.innerHTML = renderTextWithEmojisToHtml(value);
            lastValueRef.current = value;
        }
    }, []);
    
    return (
        <div className="relative w-full">
            <div
                ref={editorRef}
                contentEditable={!readOnly}
                suppressContentEditableWarning
                onInput={handleInput}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                onFocus={onFocus}
                onBlur={onBlur}
                className={`outline-none whitespace-pre-wrap [word-break:break-word] overflow-x-hidden ${className} ${isEmpty ? 'empty' : ''}`}
                style={{ minHeight: '1.5em' }}
            />
            {/* Placeholder Overlay */}
            {isEmpty && placeholder && (
                <div className="absolute top-0 left-0 h-full w-full pointer-events-none text-slate-400 dark:text-slate-500 flex items-center px-4">
                    {placeholder}
                </div>
            )}
        </div>
    );
};

export default EmojiSmartInput;
