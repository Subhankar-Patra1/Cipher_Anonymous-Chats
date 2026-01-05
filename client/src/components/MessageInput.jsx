import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';

import PickerPanel from './PickerPanel';
import ContentEditable from 'react-contenteditable';
import useAudioRecorder from '../utils/useAudioRecorder';
import { renderTextWithEmojis, renderTextWithEmojisToHtml } from '../utils/emojiRenderer';
import { linkifyText } from '../utils/linkify';



const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

import AISendIcon from './icons/AISendIcon';
import PollIcon from './icons/PollIcon';

export default function MessageInput({ 
    onSend, 
    onSendAudio, 
    onImageSelected,
    onFileSelected,
    onSendImage,
    onLocationClick,
    onPollClick,
    disabled, 
    replyTo, 
    setReplyTo,
    onSendGif,
    editingMessage,
    onCancelEdit,
    onEditMessage,
    onTypingStart,
    onTypingStop,
    isAi = false,
    isGenerating = false,
    onStop = () => {},
    members = [],
    currentUser,
    roomId,
    isBlocked = false,
    onUnblock
}) {
    if (isBlocked) {
        return (
            <div className="p-4 bg-transparent z-10 flex justify-center items-center h-[88px] transition-colors duration-300">
                <div 
                    onClick={() => { if(onUnblock) onUnblock(); }}
                    className="bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 px-6 py-3 rounded-full flex items-center gap-2 border border-red-200 dark:border-red-800 shadow-lg cursor-pointer transition-all"
                >
                    <span className="material-symbols-outlined text-red-500 text-sm">lock_open</span>
                    <span className="text-red-600 dark:text-red-400 text-sm font-medium">
                        You blocked this user. Tap to unblock.
                    </span>
                </div>
            </div>
        );
    }

    const [html, setHtml] = useState('');
    const [showEmoji, setShowEmoji] = useState(false);
    const [isClosingEmoji, setIsClosingEmoji] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isClosingAttach, setIsClosingAttach] = useState(false);
    const [emojiOffset, setEmojiOffset] = useState(0);
    const [attachOffset, setAttachOffset] = useState(0);
    const attachMenuRef = useRef(null);
    const menuContainerRef = useRef(null);
    const emojiButtonRef = useRef(null);
    const attachButtonRef = useRef(null);
    
    // [NEW] Mention State
    const [showMentionPopup, setShowMentionPopup] = useState(false);
    const [mentionSearch, setMentionSearch] = useState('');
    const [mentionIndex, setMentionIndex] = useState(0);

    const fileInputRef = useRef(null);
    const attachmentInputRef = useRef(null);

    const filteredMembers = showMentionPopup ? members.filter(m => {
        // 1. Filter out self
        if (currentUser && m.id === currentUser.id) return false;
        
        // 2. Filter out already mentioned users
        // Check if data-mention="ID" exists in current HTML
        if (html.includes(`data-mention="${m.id}"`)) return false;

        const query = mentionSearch.toLowerCase();
        return (
            m.display_name.toLowerCase().includes(query) || 
            (m.username && m.username.toLowerCase().includes(query))
        );
    }).slice(0, 5) : [];

    useEffect(() => {
        setMentionIndex(0);
    }, [mentionSearch, filteredMembers.length]); // Reset index when list changes

    const pickerRef = useRef(null);
    const editorRef = useRef(null);
    const lastRange = useRef(null);
    const [pendingGif, setPendingGif] = useState(null);

    // Typing throttle refs
    const lastTypingTime = useRef(0);
    const typingTimeoutRef = useRef(null);
    
    // [NEW] Draft message refs
    const draftSaveTimeoutRef = useRef(null);
    const previousRoomIdRef = useRef(roomId);

    // [FIX] Ref to hold latest handleSubmit to avoid stale closures in handleKeyDown
    const handleSubmitRef = useRef(null);
    useEffect(() => {
        handleSubmitRef.current = handleSubmit;
    });

    // Populate input when editing
    useEffect(() => {
        if (editingMessage) {
            // [FIX] Use caption for images and render emojis to HTML
            const initialContent = editingMessage.type === 'image' ? (editingMessage.caption || '') : editingMessage.content;
            setHtml(renderTextWithEmojisToHtml(initialContent));
            if (editorRef.current) editorRef.current.focus();
        } else {
            if (!editingMessage && html === editingMessage?.content) {
                setHtml('');
            }
        }
    }, [editingMessage]);
    
    // [NEW] Draft Messages: Load draft when room changes
    useEffect(() => {
        if (!roomId || editingMessage) return;
        
        // Save draft for previous room before switching
        if (previousRoomIdRef.current && previousRoomIdRef.current !== roomId && html.trim()) {
            const drafts = JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
            drafts[previousRoomIdRef.current] = html;
            localStorage.setItem('cipher_drafts', JSON.stringify(drafts));
        }
        
        // Load draft for new room
        const drafts = JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
        const savedDraft = drafts[roomId] || '';
        setHtml(savedDraft);
        if (editorRef.current) {
            editorRef.current.innerHTML = savedDraft;
        }
        
        previousRoomIdRef.current = roomId;
    }, [roomId]);
    
    // [NEW] Draft Messages: Debounced save on content change
    useEffect(() => {
        if (!roomId || editingMessage) return;
        
        // Clear previous timeout
        if (draftSaveTimeoutRef.current) {
            clearTimeout(draftSaveTimeoutRef.current);
        }
        
        // Debounce save by 500ms
        draftSaveTimeoutRef.current = setTimeout(() => {
            const drafts = JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
            
            // Strip HTML tags to check if there's actual content
            const textContent = html.replace(/<[^>]*>/g, '').trim();
            
            if (textContent) {
                drafts[roomId] = html;
            } else {
                delete drafts[roomId];
            }
            localStorage.setItem('cipher_drafts', JSON.stringify(drafts));
            
            // Dispatch storage event for same-tab listeners
            window.dispatchEvent(new Event('draftsUpdated'));
        }, 300);
        
        return () => {
            if (draftSaveTimeoutRef.current) {
                clearTimeout(draftSaveTimeoutRef.current);
            }
        };
    }, [html, roomId, editingMessage]);

    // [FIX] Auto-focus when replying
    useEffect(() => {
        if (replyTo && editorRef.current) {
            // Small timeout to ensure render visibility if needed, but direct focus usually works
            editorRef.current.focus();
        }
    }, [replyTo]);

    // Audio Recorder
    const { 
        isRecording, 
        duration, 
        audioBlob, 
        waveform: liveWaveform, 
        startRecording, 
        stopRecording, 
        resetRecording 
    } = useAudioRecorder();

    const [isReviewing, setIsReviewing] = useState(false);
    const [isPlayingPreview, setIsPlayingPreview] = useState(false);
    const previewAudioRef = useRef(null);

    // Effects for Preview Audio
    useEffect(() => {
        if (!isReviewing || !audioBlob) return;
        
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        previewAudioRef.current = audio;

        audio.onended = () => setIsPlayingPreview(false);

        return () => {
            audio.pause();
            URL.revokeObjectURL(url);
        };
    }, [isReviewing, audioBlob]);

    const handleTogglePreview = () => {
        if (!previewAudioRef.current) return;
        if (isPlayingPreview) {
            previewAudioRef.current.pause();
        } else {
            previewAudioRef.current.play();
        }
        setIsPlayingPreview(!isPlayingPreview);
    };

    const handleStartRecording = () => {
        setIsReviewing(false);
        startRecording();
    };

    const handleStopRecording = () => {
        stopRecording();
        setIsReviewing(true);
    };

    const handleCancelRecording = () => {
        stopRecording(); // Ensure stopped
        resetRecording();
        setIsReviewing(false);
        setIsPlayingPreview(false);
    };

    const handleSendRecording = () => {
        if (audioBlob) {
            // Normalized waveform 0-1 (already done by hook, but ensure)
            onSendAudio(audioBlob, duration, liveWaveform); 
            handleCancelRecording(); // Clean up state
        }
    };

    // [NEW] Apply live bold formatting to HTML for preview
    const applyBoldFormatting = (htmlContent) => {
        if (!htmlContent) return '';
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;

        // Cleanup: remove existing bold-star and bold-content spans to re-evaluate
        tempDiv.querySelectorAll('.bold-star, .bold-content').forEach(span => {
            span.replaceWith(...span.childNodes);
        });
        tempDiv.normalize();

        const html = tempDiv.innerHTML;
        // Regex for bold that permits tags (like <img>) inside the content
        // Pattern: * followed by non-space, then any chars/tags (no block tags), ending with non-space follow by *
        // We use lookaheads/lookbehinds for the start/end non-space check.
        const boldRegex = /\*\*(?!(?:\s|&nbsp;))((?:(?!<\/?(?:div|p|br)[^>]*>)[^*]|<[^>]+>)+?)(?<!(?:\s|&nbsp;))\*\*|\*(?!(?:\s|&nbsp;))((?:(?!<\/?(?:div|p|br)[^>]*>)[^*]|<[^>]+>)+?)(?<!(?:\s|&nbsp;))\*/g;
        
        const newHtml = html.replace(boldRegex, (match, double, single) => {
            const stars = match.startsWith('**') ? '**' : '*';
            const content = double || single;
            return `<span class="bold-star">${stars}</span><span class="bold-content">${content}</span><span class="bold-star">${stars}</span>`;
        });
        
        return newHtml;
    };

    // [NEW] Cursor Preservation Helpers
    const getCaretOffset = (element) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return 0;
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(element);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    };

    const setCaretOffset = (element, offset) => {
        const selection = window.getSelection();
        const range = document.createRange();
        let currentOffset = 0;

        const traverseNodes = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const nodeLength = node.textContent.length;
                if (currentOffset + nodeLength >= offset) {
                    range.setStart(node, offset - currentOffset);
                    range.setEnd(node, offset - currentOffset);
                    return true;
                }
                currentOffset += nodeLength;
            } else {
                for (let i = 0; i < node.childNodes.length; i++) {
                    if (traverseNodes(node.childNodes[i])) return true;
                }
            }
            return false;
        };

        traverseNodes(element);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    // Save selection whenever cursor moves
    const saveSelection = () => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
            lastRange.current = range.cloneRange();
            }
        }
    };


    // Memoized closing functions for animations
    const closeAttachMenu = useCallback(() => {
        if (showAttachMenu && !isClosingAttach) {
            setIsClosingAttach(true);
            setTimeout(() => {
                setShowAttachMenu(false);
                setIsClosingAttach(false);
            }, 350);
        }
    }, [showAttachMenu, isClosingAttach]);

    const closeEmojiPicker = useCallback(() => {
        if (showEmoji && !isClosingEmoji) {
            setIsClosingEmoji(true);
            setTimeout(() => {
                setShowEmoji(false);
                setIsClosingEmoji(false);
            }, 300);
        }
    }, [showEmoji, isClosingEmoji]);

    const handleToggleAttach = () => {
        if (showAttachMenu) {
            closeAttachMenu();
        } else {
            if (showEmoji) closeEmojiPicker();
            setShowAttachMenu(true);
        }
    };

    const handleToggleEmoji = () => {
        if (showEmoji) {
            closeEmojiPicker();
        } else {
            if (showAttachMenu) closeAttachMenu();
            setShowEmoji(true);
        }
    };

    // [NEW] Smart Positioning Logic
    useLayoutEffect(() => {
        const adjustPosition = () => {
            const viewportWidth = window.innerWidth;
            const margin = 12;

            // 1. Emoji Picker
            if (emojiButtonRef.current && pickerRef.current) {
                const btnRect = emojiButtonRef.current.getBoundingClientRect();
                const menuWidth = pickerRef.current.offsetWidth;
                
                const menuCenter = btnRect.left + btnRect.width / 2;
                const menuLeft = menuCenter - menuWidth / 2;
                const menuRight = menuCenter + menuWidth / 2;
                
                let shift = 0;
                if (menuRight > viewportWidth - margin) {
                    shift = viewportWidth - margin - menuRight;
                } else if (menuLeft < margin) {
                    shift = margin - menuLeft;
                }
                setEmojiOffset(shift);
            }

            // 2. Attach Menu
            if (attachButtonRef.current && menuContainerRef.current) {
                const btnRect = attachButtonRef.current.getBoundingClientRect();
                const menuWidth = menuContainerRef.current.offsetWidth;
                
                let shift = 0;
                if (window.innerWidth >= 640) {
                    const menuCenter = btnRect.left + btnRect.width / 2;
                    const menuLeft = menuCenter - menuWidth / 2;
                    const menuRight = menuCenter + menuWidth / 2;
                    if (menuRight > viewportWidth - margin) shift = viewportWidth - margin - menuRight;
                    else if (menuLeft < margin) shift = margin - menuLeft;
                } else {
                    const menuLeft = btnRect.left;
                    if (menuLeft + menuWidth > viewportWidth - margin) shift = viewportWidth - margin - (menuLeft + menuWidth);
                    else if (menuLeft < margin) shift = margin - menuLeft;
                }
                setAttachOffset(shift);
            }
        };

        if (showEmoji || showAttachMenu) {
            adjustPosition();
            window.addEventListener('resize', adjustPosition);
            return () => window.removeEventListener('resize', adjustPosition);
        } else {
            setEmojiOffset(0);
            setAttachOffset(0);
        }
    }, [showEmoji, showAttachMenu]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showAttachMenu && attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
            closeAttachMenu();
        }
        if (showEmoji && pickerRef.current && !pickerRef.current.contains(event.target)) {
            closeEmojiPicker();
        }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAttachMenu, closeAttachMenu]);

    const handleSelectMention = (user) => {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const textNode = range.startContainer;
        if (textNode.nodeType !== Node.TEXT_NODE) return;
        
        const textStr = textNode.textContent;
        const caret = range.startOffset;
        const textBefore = textStr.slice(0, caret);
        const lastAt = textBefore.lastIndexOf('@');
        
        if (lastAt === -1) return;

        const newRange = document.createRange();
        newRange.setStart(textNode, lastAt);
        newRange.setEnd(textNode, caret);
        selection.removeAllRanges();
        selection.addRange(newRange);
        
        const mentionHtml = `<span data-mention="${user.id}" class="text-violet-600 dark:text-violet-400 font-bold bg-violet-50 dark:bg-violet-900/30 rounded px-1" contenteditable="false">@${renderTextWithEmojisToHtml(user.display_name)}</span>&nbsp;`;
        document.execCommand('insertHTML', false, mentionHtml);
        
        setShowMentionPopup(false);
        setMentionSearch('');
    };

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        
        if (showMentionPopup) {
            if (filteredMembers.length > 0) {
                handleSelectMention(filteredMembers[mentionIndex]);
            } else {
                setShowMentionPopup(false);
            }
            return;
        }

        const domHtml = editorRef.current?.innerHTML || "";
        let content = domHtml;

        // Strip HTML (keep simple logic or improve later)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        
        // [NEW] Encode Mentions
        const mentions = tempDiv.querySelectorAll('span[data-mention]');
        mentions.forEach(span => {
            const id = span.getAttribute('data-mention');
            const name = span.textContent.replace('@', ''); // Assuming textContent is "@Name"
            const encoded = `@[${name}](user:${id})`;
            span.replaceWith(document.createTextNode(encoded));
        });

        const images = tempDiv.getElementsByTagName('img');
        while (images.length > 0) {
            const img = images[0];
            const alt = img.getAttribute('alt') || '';
            const textNode = document.createTextNode(alt);
            img.parentNode.replaceChild(textNode, img);
        }

        const brs = tempDiv.getElementsByTagName('br');
        while (brs.length > 0) {
            const br = brs[0];
            const newline = document.createTextNode('\n');
            br.parentNode.replaceChild(newline, br);
        }

        let plainText = tempDiv.textContent || "";
        plainText = plainText.replace(/\r\n/g, "\n");
        plainText = plainText.trimEnd();

        // Handle GIF send
        if (pendingGif) {
            // Send GIF with plainText as caption (if any)
            onSendGif(pendingGif, plainText); 
            
            // Cleanup
            setPendingGif(null);
            setHtml('');
            if (editorRef.current) editorRef.current.innerHTML = "";
            setShowEmoji(false);
            lastRange.current = null;
            onTypingStop?.();
            clearTimeout(typingTimeoutRef.current);
            return;
        }

        if (!content.trim() && !plainText) return; // Don't send empty if no GIF

        if (plainText) {
            if (editingMessage) {
                // Handle edit submission
                const originalText = editingMessage.type === 'image' ? (editingMessage.caption || '') : editingMessage.content;
                if (plainText !== originalText) {
                    onEditMessage(editingMessage.id, plainText);
                } else {
                    onCancelEdit();
                }
            } else {
                onSend(plainText);
            }
            
            // [NEW] Clear draft for this room
            if (roomId) {
                const drafts = JSON.parse(localStorage.getItem('cipher_drafts') || '{}');
                delete drafts[roomId];
                localStorage.setItem('cipher_drafts', JSON.stringify(drafts));
            }
            
            // Cleanup
            setHtml('');
            if (editorRef.current) editorRef.current.innerHTML = "";
            setShowEmoji(false);
            lastRange.current = null;
            onTypingStop?.(); // Stop typing immediately
            clearTimeout(typingTimeoutRef.current);
        }
    };

    const handleEmojiClick = (emojiData) => {
        const hex = emojiData.unified.split('-').filter(c => c !== 'fe0f').join('-');
        
        const imageUrl = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${hex}.png`;
        const imageTag = `<img src="${imageUrl}" alt="${emojiData.emoji}" class="w-6 h-6 inline-block align-bottom" style="margin: 0 1px;" draggable="false" />`;
        
        if (lastRange.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(lastRange.current);
        } else if (editorRef.current) {
            editorRef.current.focus();
        }

        document.execCommand('insertHTML', false, imageTag);
        saveSelection(); 
    };

    const handleGifClick = (gif) => {
        setPendingGif(gif);
        setShowEmoji(false);
        if (editorRef.current) editorRef.current.focus();
    };

    const handleRemoveGif = () => {
        setPendingGif(null);
    };

    // [NEW] Image Handlers
    const handleImageChange = async (e) => {
        const files = Array.from(e.target.files || []); // [NEW] Handle multiple
        if (files.length > 0) {
             // [NEW] Delegate to parent for Scoped Preview
             if (onImageSelected) {
                 // Pass array if parent supports it, otherwise fallback (implementation plan says update parent too)
                 // Parent expects "files" (plural) in new logic?
                 // Let's pass the array. ChatWindow needs to handle it.
                 onImageSelected(files);
             }
             // Clear input so same file can be selected again
             if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            if (onFileSelected) {
                // Pass array
                onFileSelected(files);
            }
            if (attachmentInputRef.current) attachmentInputRef.current.value = '';
        }
    };

    const handleChange = (evt) => {
        const newHtml = evt.target.value ?? evt.target.innerHTML;
        
        // [NEW] Apply bold formatting preview
        const formatted = applyBoldFormatting(newHtml);
        
        // If formatting changed the content, we need to save/restore caret
        if (formatted !== newHtml && editorRef.current) {
            const offset = getCaretOffset(editorRef.current);
            setHtml(formatted);
            // We use a timeout to let React update the DOM before restoring caret
            setTimeout(() => {
                if (editorRef.current) setCaretOffset(editorRef.current, offset);
            }, 0);
        } else {
            setHtml(newHtml);
        }
        
        saveSelection();

        // Mention Detection
        if (members && members.length > 0) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const textNode = range.startContainer;
                // Only if we are typing in text
                if (textNode.nodeType === Node.TEXT_NODE) {
                    const text = textNode.textContent;
                    const caret = range.startOffset;
                    const textBefore = text.slice(0, caret);
                    const lastAt = textBefore.lastIndexOf('@');
                    
                    if (lastAt !== -1) {
                        const prevChar = textBefore[lastAt - 1];
                        // Start of line or space before @
                        if (lastAt === 0 || prevChar === ' ' || prevChar === '\u00A0' || prevChar === '\n') {
                            const query = textBefore.slice(lastAt + 1);
                            // Simple heuristic: if query is too long, stop showing
                            if (query.length < 20 && !query.includes(' ')) {
                                setMentionSearch(query);
                                setShowMentionPopup(true);
                            } else {
                                setShowMentionPopup(false);
                            }
                        } else {
                            setShowMentionPopup(false);
                        }
                    } else {
                        setShowMentionPopup(false);
                    }
                } else {
                    setShowMentionPopup(false);
                }
            }
        }

        // Typing Detection
        if (!editingMessage && onTypingStart && onTypingStop) {
             const now = Date.now();
             
             // Emit start if not throttled
             if (now - lastTypingTime.current > 2000) {
                 onTypingStart();
                 lastTypingTime.current = now;
             }

             // Reset stop timeout
             if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
             
             // Stop after 3 seconds of inactivity
             typingTimeoutRef.current = setTimeout(() => {
                 onTypingStop();
             }, 3000);
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();

        // Handle Files/Images
        const items = e.clipboardData.items;
        const mediaFiles = [];
        const otherFiles = [];

        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file) {
                    if (file.type.startsWith('image/')) {
                        mediaFiles.push(file);
                    } else {
                        otherFiles.push(file);
                    }
                }
            }
        }

        if (mediaFiles.length > 0 && onImageSelected) {
            onImageSelected(mediaFiles);
        }
        
        if (otherFiles.length > 0 && onFileSelected) {
            onFileSelected(otherFiles);
        }

        if (mediaFiles.length === 0 && otherFiles.length === 0) {
            const text = e.clipboardData.getData("text");
            if (text) {
                document.execCommand('insertText', false, text);
                saveSelection();
            }
        }
    };

    const handleKeyDown = (e) => {
        if (showMentionPopup && filteredMembers.length > 0) {
             if (e.key === 'ArrowDown') {
                 e.preventDefault();
                 setMentionIndex(prev => (prev + 1) % filteredMembers.length);
                 return;
             }
             if (e.key === 'ArrowUp') {
                 e.preventDefault();
                 setMentionIndex(prev => (prev - 1 + filteredMembers.length) % filteredMembers.length);
                 return;
             }
             if (e.key === 'Enter' || e.key === 'Tab') {
                 e.preventDefault();
                 handleSelectMention(filteredMembers[mentionIndex]);
                 return;
             }
             if (e.key === 'Escape') {
                 e.preventDefault();
                 setShowMentionPopup(false);
                 return;
             }
        }

        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            // [FIX] Use ref to get latest closure
            if (handleSubmitRef.current) {
                handleSubmitRef.current();
            }
        }
    };

    // Render Recording UI if active
    if (isRecording || isReviewing) {
        return (
            <div className="p-2 md:p-4 bg-transparent z-10 relative transition-colors duration-300">
                <div className="flex gap-3 max-w-4xl mx-auto items-center justify-between h-[56px] px-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none transition-colors">
                    
                    {/* Left Side: Status / Delete */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-3 h-3 rounded-full shrink-0 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`} />
                        <span className="text-slate-700 dark:text-slate-200 font-mono min-w-[50px] shrink-0">{formatDuration(duration)}</span>
                        
                        {isRecording && (
                           <div className="flex items-center gap-[2px] h-6 ml-2 overflow-hidden mask-linear-fade">
                               {liveWaveform.map((v, i) => (
                                   <div 
                                       key={i}
                                       className="w-[3px] bg-red-400 rounded-full transition-all duration-75 shrink-0"
                                       style={{ height: `${20 + v * 80}%`, opacity: 0.5 + v * 0.5 }}
                                   />
                               ))}
                           </div>
                        )}
                    </div>

                    {/* Right Side: Controls */}
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleCancelRecording}
                            className="w-10 h-10 flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded-full transition-colors"
                            title="Cancel"
                        >
                            <span className="material-symbols-outlined">delete</span>
                        </button>

                        {isRecording ? (
                            <button 
                                onClick={handleStopRecording}
                                className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center justify-center text-red-500 dark:text-red-400 transition-all border border-red-500/20"
                            >
                                <span className="material-symbols-outlined">stop_circle</span>
                            </button>
                        ) : (
                            <>
                                <button 
                                    onClick={handleTogglePreview}
                                    className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
                                    title={isPlayingPreview ? "Pause" : "Play Preview"}
                                >
                                    <span className="material-symbols-outlined text-[24px]">{isPlayingPreview ? 'pause' : 'play_arrow'}</span>
                                </button>
                                <button 
                                    onClick={handleSendRecording}
                                    className="w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center text-white shadow-lg shadow-violet-500/20 transition-all hover:scale-105 active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[20px]">send</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Logic for placeholder vs send button
    // hasText: strictly for checking if text exists (controls placeholder)
    const hasText = html.replace(/<[^>]*>/g, '').trim().length > 0 || html.includes('<img');
    
    // hasContent: logic for enabling send button (either text OR gif)
    const hasContent = hasText || pendingGif;

    const handleBackspace = () => {
        // Restore selection if we have it
        if (lastRange.current) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(lastRange.current);
        } else if (editorRef.current) {
            // Fallback: focus to end if no range saved (though usually we have one)
             editorRef.current.focus();
             // Move caret to end
             const range = document.createRange();
             range.selectNodeContents(editorRef.current);
             range.collapse(false);
             const sel = window.getSelection();
             sel.removeAllRanges();
             sel.addRange(range);
        }
        
        document.execCommand('delete');
        saveSelection();
    };

    return (
        <div className="p-2 md:p-4 bg-transparent z-10 relative transition-colors duration-300">
            <form onSubmit={handleSubmit} className="flex gap-3 max-w-4xl mx-auto items-end">
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                    {/* Editing Bar */}
                    {editingMessage && (
                         <div className="
                            w-full
                            flex justify-between items-center
                            bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700
                            rounded-t-2xl rounded-b-md
                            px-4 py-2 transition-colors
                         ">
                             <div className="flex items-center gap-2">
                                 {editingMessage.type === 'image' && (
                                     <span className="material-symbols-outlined text-violet-600 dark:text-violet-300 text-[18px]">image</span>
                                 )}
                                 <span className="text-sm font-bold text-violet-600 dark:text-violet-300">Editing message</span>
                             </div>
                             <div className="flex gap-2">
                                 <button
                                     onClick={() => {
                                         setHtml(''); /* Clear or reset */
                                         onCancelEdit();
                                     }}
                                     className="text-xs px-2 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700/50 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors"
                                     type="button"
                                 >
                                     Cancel
                                 </button>
                             </div>
                         </div>
                    )}
                    
                    {!editingMessage && replyTo && (
                        <div className="
                            w-full
                            flex justify-between items-start
                            bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700
                            rounded-t-2xl rounded-b-md
                            px-4 py-2 transition-colors
                        ">
                            <div className="flex items-center gap-2 max-w-[90%]">
                                {replyTo.is_view_once ? (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-violet-600 dark:text-violet-300 flex items-center gap-1">{renderTextWithEmojis(replyTo.sender)}</span>
                                        <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-slate-500 dark:text-slate-400 shrink-0">
                                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" strokeLinecap="round" />
                                                <path d="M10.5 9L12 7.5V16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            Photo
                                        </span>
                                    </div>
                                ) : replyTo.type === 'audio' ? (
                                    <>
                                         <span className="material-symbols-outlined text-violet-500 dark:text-violet-300 text-sm">mic</span>
                                         <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-violet-600 dark:text-violet-300">{renderTextWithEmojis(replyTo.sender)}</span>
                                            <span className="text-xs text-slate-600 dark:text-slate-300">Voice message</span>
                                        </div>
                                    </>
                                ) : replyTo.type === 'file' ? (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-violet-600 dark:text-violet-300 flex items-center gap-1">{renderTextWithEmojis(replyTo.sender)}</span>
                                        <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">description</span>
                                            {replyTo.caption || replyTo.file_name || "File"}
                                        </span>
                                    </div>
                                ) : replyTo.type === 'poll' ? (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-violet-600 dark:text-violet-300 flex items-center gap-1">{renderTextWithEmojis(replyTo.sender)}</span>
                                        <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                            <PollIcon className="w-4 h-4 shrink-0" />
                                            {renderTextWithEmojis(replyTo.poll_question) || 'Poll'}
                                        </span>
                                    </div>
                                ) : replyTo.type === 'location' ? (
                                    <div className="flex justify-between items-center w-full gap-2">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-violet-600 dark:text-violet-300 flex items-center gap-1">{renderTextWithEmojis(replyTo.sender)}</span>
                                            <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">location_on</span>
                                                Location
                                            </span>
                                        </div>
                                        {replyTo.latitude && replyTo.longitude && (
                                            <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700">
                                                <img 
                                                    src={`https://static-maps.yandex.ru/1.x/?lang=en-US&ll=${replyTo.longitude},${replyTo.latitude}&z=10&l=map&size=100,100&pt=${replyTo.longitude},${replyTo.latitude},pm2rdm`}
                                                    alt="Map"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : replyTo.type === 'image' ? (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-violet-600 dark:text-violet-300 flex items-center gap-1">{renderTextWithEmojis(replyTo.sender)}</span>
                                        <span className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm">image</span>
                                            {replyTo.attachments && replyTo.attachments.length > 1 
                                                ? `${replyTo.attachments.length} photos` 
                                                : (replyTo.caption || "Photo")}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-violet-600 dark:text-violet-300">{renderTextWithEmojis(replyTo.sender)}</span>
                                        <span className="text-sm text-slate-600 dark:text-slate-300 break-words line-clamp-2 max-h-[3em]">{linkifyText(replyTo.text, '', 'text-violet-600 dark:text-violet-400 hover:underline')}</span>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => setReplyTo(null)}
                                className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>
                    )}

                    <div className={`
                        relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 transition-all flex flex-col focus-within:ring-2 focus-within:ring-violet-500/50 focus-within:border-violet-500/50
                        ${replyTo ? 'rounded-b-2xl rounded-t-md' : 'rounded-2xl'} 
                        shadow-md dark:shadow-none
                    `}>
                        {/* Pending GIF Preview */}
                        {pendingGif && (
                             <div className="p-3 border-b border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/30 rounded-t-2xl flex justify-center relative transition-colors">
                                 <div className="composer-gif-preview rounded-xl relative inline-block group">
                                     <video
                                         src={pendingGif.mp4_url || pendingGif.gif_url}
                                         className="w-[220px] h-auto rounded-md shadow-lg bg-black/50 ring-1 ring-white/10"
                                         autoPlay
                                         muted
                                         loop
                                         playsInline
                                         controls={false}
                                         onClick={(e) => {
                                             if (e.target.paused) e.target.play();
                                             else e.target.pause();
                                         }}
                                     />
                                     <button 
                                        onClick={handleRemoveGif}
                                        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all backdrop-blur-md shadow-sm"
                                        title="Remove GIF"
                                     >
                                        <span className="material-symbols-outlined text-[16px] font-bold">close</span>
                                     </button>
                                 </div>
                             </div>
                        )}

                        
                        
                        <div className="flex items-center relative">
                         {showMentionPopup && filteredMembers.length > 0 && (
                            <div className="absolute bottom-full mb-2 left-0 z-50 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                <div className="p-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                                    {filteredMembers.map((member, idx) => (
                                        <button
                                            key={member.id}
                                            onClick={() => handleSelectMention(member)}
                                            onMouseEnter={() => setMentionIndex(idx)}
                                            className={`w-full flex items-center gap-2 p-2 rounded-md transition-colors text-left ${
                                                idx === mentionIndex 
                                                ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' 
                                                : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200'
                                            }`}
                                        >
                                            {member.avatar_thumb_url ? (
                                                <img src={member.avatar_thumb_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold">
                                                    {member.display_name?.[0]}
                                                </div>
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium truncate">{renderTextWithEmojis(member.display_name)}</span>
                                                <span className="text-xs text-slate-400 truncate">
                                                    {member.username.startsWith('@') ? member.username : `@${member.username}`}
                                                </span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                         )}
                            <ContentEditable
                                innerRef={editorRef}
                                html={html}
                                disabled={disabled}
                                onChange={handleChange}
                                onPaste={handlePaste}
                                onKeyUp={saveSelection}
                                onMouseUp={saveSelection}
                                onKeyDown={handleKeyDown}
                                className="w-full text-slate-800 dark:text-slate-100 pl-4 pr-2 py-3 focus:outline-none min-h-[48px] max-h-[150px] overflow-y-auto whitespace-pre-wrap break-words custom-scrollbar placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
                                tagName="div"
                            />
                            
                            {!hasText && (
                                <div className="absolute left-4 top-3 text-slate-400 dark:text-slate-500 pointer-events-none select-none transition-colors">
                                    {pendingGif 
                                        ? "Enter caption (optional)..." 
                                        : "Type a message..."
                                    }
                                </div>
                            )}

                            <div className="pr-2 flex items-center gap-1">
                                <div className="relative">
                                    {showEmoji && (
                                        <div 
                                            className={`
                                                absolute bottom-full left-1/2 mb-4 z-50 
                                                shadow-2xl rounded-2xl w-[90vw] sm:w-[350px] h-[400px] overflow-hidden
                                                ${isClosingEmoji ? 'born-out' : 'born-in'}
                                            `}
                                            ref={pickerRef}
                                            style={{ 
                                                '--menu-tx': `calc(-50% + ${emojiOffset}px)`
                                            }}
                                        >
                                            <PickerPanel 
                                                onEmojiClick={handleEmojiClick}
                                                onGifClick={handleGifClick}
                                                disableGifTab={isAi || !!pendingGif}
                                                onBackspace={handleBackspace}
                                            />
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleToggleEmoji}
                                        ref={emojiButtonRef}
                                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
                                            (showEmoji && !isClosingEmoji)
                                            ? 'text-violet-500 bg-violet-50 dark:bg-slate-800 dark:text-white' 
                                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                        title="Insert Emoji"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                                    </button>
                                </div>

                                {!isAi && (
                                    <div className="relative" ref={attachMenuRef}>
                                        <button
                                            type="button"
                                            onClick={handleToggleAttach}
                                            ref={attachButtonRef}
                                            className={`w-10 h-10 transition-all duration-200 ease-out flex items-center justify-center rounded-full ${
                                                (showAttachMenu && !isClosingAttach) 
                                                ? 'text-violet-500 bg-violet-50 dark:bg-slate-800 dark:text-white rotate-45' 
                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rotate-0'
                                            }`}
                                            title="Attach"
                                            disabled={disabled}
                                        >
                                            <span className="material-symbols-outlined text-[24px] leading-[0]">add</span>
                                        </button>

                                        {showAttachMenu && (
                                            <div 
                                                className={`
                                                    absolute bottom-full left-1/2 mb-4 z-50 
                                                    max-sm:left-0 max-sm:translate-x-0
                                                    ${isClosingAttach ? 'born-out' : 'born-in'}
                                                `}
                                                ref={menuContainerRef}
                                                style={{ 
                                                    '--menu-tx': window.innerWidth >= 640 ? `calc(-50% + ${attachOffset}px)` : `${attachOffset}px`
                                                }}
                                            >
                                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-[18px] shadow-2xl p-1.5 sm:p-2 min-w-[160px] sm:min-w-[180px] flex flex-col gap-0.5 sm:gap-1 overflow-hidden">
                                                    {/* Image Option */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            fileInputRef.current?.click();
                                                            closeAttachMenu();
                                                        }}
                                                        style={{ 
                                                            animationDelay: isClosingAttach ? '150ms' : '0ms' 
                                                        }}
                                                        className={`w-full flex items-center gap-2.5 p-2 rounded-[12px] hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors text-left group ${isClosingAttach ? 'item-out' : 'item-in'}`}
                                                    >
                                                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-blue-500 grid place-items-center text-white shadow-lg shadow-blue-500/20">
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 sm:w-[18px] sm:h-[18px]">
                                                                <path d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM5 5h14v9.59l-3.29-3.3a1 1 0 00-1.42 0L11 14.59l-2.29-2.3a1 1 0 00-1.42 0L5 14.59V5zm0 14v-2.59l3-3 2.29 2.3a1 1 0 001.42 0L15 12.41l4 4V19H5z"/>
                                                                <circle cx="8" cy="8" r="1.5"/>
                                                            </svg>
                                                        </div>
                                                        <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Image</span>
                                                    </button>

                                                    {/* File Option */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            attachmentInputRef.current?.click();
                                                            closeAttachMenu();
                                                        }}
                                                        style={{ 
                                                            animationDelay: isClosingAttach ? '100ms' : '50ms' 
                                                        }}
                                                        className={`w-full flex items-center gap-2.5 p-2 rounded-[12px] hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors text-left group ${isClosingAttach ? 'item-out' : 'item-in'}`}
                                                    >
                                                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-indigo-600 grid place-items-center text-white shadow-lg shadow-indigo-600/20">
                                                            <span className="material-symbols-outlined text-[18px] sm:text-[20px] rotate-45">attach_file</span>
                                                        </div>
                                                        <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">File</span>
                                                    </button>

                                                    {/* Location Option */}
                                                    {onLocationClick && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onLocationClick();
                                                                closeAttachMenu();
                                                            }}
                                                            style={{ 
                                                                animationDelay: isClosingAttach ? '50ms' : '100ms' 
                                                            }}
                                                            className={`w-full flex items-center gap-2.5 p-2 rounded-[12px] hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors text-left group ${isClosingAttach ? 'item-out' : 'item-in'}`}
                                                        >
                                                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-green-500 grid place-items-center text-white shadow-lg shadow-green-500/20">
                                                                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">location_on</span>
                                                            </div>
                                                            <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Location</span>
                                                        </button>
                                                    )}

                                                    {/* Poll Option */}
                                                    {onPollClick && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onPollClick();
                                                                closeAttachMenu();
                                                            }}
                                                            style={{ 
                                                                animationDelay: isClosingAttach ? '0ms' : '150ms' 
                                                            }}
                                                            className={`w-full flex items-center gap-2.5 p-2 rounded-[12px] hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors text-left group ${isClosingAttach ? 'item-out' : 'item-in'}`}
                                                        >
                                                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-yellow-500 grid place-items-center text-white shadow-lg shadow-yellow-500/20">
                                                                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">ballot</span>
                                                            </div>
                                                            <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">Poll</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    accept="image/*" 
                                    className="hidden" 
                                    multiple 
                                    onChange={handleImageChange} 
                                />
                                <input 
                                    type="file" 
                                    ref={attachmentInputRef} 
                                    accept="*" 
                                    className="hidden" 
                                    multiple 
                                    onChange={handleFileChange} 
                                />
                            </div>
                        </div>
                    </div>
                </div>


                {hasContent || isAi ? ( // [FIX] Always show Send button for AI (hide Mic)
                    <button 
                        type={isGenerating ? "button" : "submit"} // [FIX] Type button for Stop to prevent submit
                        onClick={isGenerating ? onStop : undefined} // [FIX] Call stop handler
                        className={`
                            p-3 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0
                            ${disabled && !isGenerating // [FIX] If disabled but NOT generating (e.g. just thinking), show disabled style. If generating, show Stop style.
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                                : isGenerating
                                    ? 'bg-slate-200 dark:bg-slate-700 text-red-500 hover:bg-slate-300 dark:hover:bg-slate-600 shadow-sm border border-red-200 dark:border-red-900/30' // Stop button style
                                : !hasContent
                                    ? 'bg-violet-600/50 text-white/50 cursor-default shadow-none' 
                                    : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95'
                            }
                        `}
                        disabled={disabled && !isGenerating} // Enable if generating (to click stop)
                    >
                        {isGenerating ? (
                             <span className="material-symbols-outlined animate-pulse">stop_circle</span>
                        ) : isAi ? (
                            <AISendIcon className="w-6 h-6 text-white" />
                        ) : (
                            <span className="material-symbols-outlined">send</span>
                        )}
                    </button>
                ) : (
                    <button 
                        type="button" 
                        onClick={handleStartRecording}
                        className={`
                            p-3 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0
                            ${disabled 
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed' 
                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:scale-105 active:scale-95'
                            }
                        `}
                        disabled={disabled}
                        title="Record voice message"
                    >
                         <span className="material-symbols-outlined">mic</span>
                    </button>
                )}
            </form>

            {isAi && (
                <p className="mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500 font-medium opacity-80 select-none cursor-default max-w-2xl mx-auto leading-relaxed">
                    AI can make mistakes, so double-check it. Sparkle AI is in beta version, so some features may not work at this moment.
                </p>
            )}
        </div>
    );
}
