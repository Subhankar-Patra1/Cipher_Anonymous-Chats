import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { renderTextWithEmojis } from '../utils/emojiRenderer';

/**
 * PollMessage - Renders a poll with click-to-vote and view votes popup
 * Uses optimistic updates for instant feedback
 */
export default function PollMessage({ poll, onVote, onClose, isMe }) {
    const { user, token } = useAuth();
    const [showVotesModal, setShowVotesModal] = useState(false);
    const [freshPollData, setFreshPollData] = useState(null);
    const [loadingVotes, setLoadingVotes] = useState(false);
    
    // Optimistic state for instant feedback
    const [optimisticVotes, setOptimisticVotes] = useState(poll?.user_votes || []);
    const [optimisticOptions, setOptimisticOptions] = useState(poll?.options || []);
    const [optimisticTotalVoters, setOptimisticTotalVoters] = useState(poll?.total_voters || 0);
    const [optimisticClosed, setOptimisticClosed] = useState(poll?.is_closed || false);

    // Sync with server data when poll updates
    useEffect(() => {
        if (poll) {
            setOptimisticVotes(poll.user_votes || []);
            setOptimisticOptions(poll.options || []);
            setOptimisticTotalVoters(poll.total_voters || 0);
            setOptimisticClosed(poll.is_closed || false);
        }
    }, [poll]);

    if (!poll) return null;

    const hasVoted = optimisticVotes.length > 0;

    // Handle click on option - optimistic vote/unvote
    const handleOptionClick = async (optionId) => {
        if (optimisticClosed) return;

        const currentVotes = [...optimisticVotes];
        const isAlreadyVoted = currentVotes.includes(optionId);
        const hadVotedBefore = currentVotes.length > 0;
        
        let newVotes;
        if (poll.is_multiple_choice) {
            if (isAlreadyVoted) {
                newVotes = currentVotes.filter(id => id !== optionId);
            } else {
                newVotes = [...currentVotes, optionId];
            }
        } else {
            if (isAlreadyVoted) {
                newVotes = [];
            } else {
                newVotes = [optionId];
            }
        }
        
        // Optimistic update - instant feedback
        const newOptions = optimisticOptions.map(opt => {
            let newCount = opt.vote_count;
            
            // If we're adding a vote to this option
            if (newVotes.includes(opt.id) && !currentVotes.includes(opt.id)) {
                newCount++;
            }
            // If we're removing a vote from this option
            else if (!newVotes.includes(opt.id) && currentVotes.includes(opt.id)) {
                newCount = Math.max(0, newCount - 1);
            }
            
            return { ...opt, vote_count: newCount };
        });
        
        // Update total voters count
        let newTotalVoters = optimisticTotalVoters;
        if (!hadVotedBefore && newVotes.length > 0) {
            newTotalVoters++; // New voter
        } else if (hadVotedBefore && newVotes.length === 0) {
            newTotalVoters = Math.max(0, newTotalVoters - 1); // Removed all votes
        }
        
        setOptimisticVotes(newVotes);
        setOptimisticOptions(newOptions);
        setOptimisticTotalVoters(newTotalVoters);
        
        // Fire and forget - no waiting for response
        try {
            onVote(poll.id, newVotes);
        } catch (err) {
            console.error('Failed to vote:', err);
            // Revert on error
            setOptimisticVotes(currentVotes);
            setOptimisticOptions(optimisticOptions);
            setOptimisticTotalVoters(optimisticTotalVoters);
        }
    };

    const handleClose = () => {
        if (onClose && poll.created_by === user.id) {
            // Optimistic close
            setOptimisticClosed(true);
            onClose(poll.id);
        }
    };

    // Fetch fresh poll data when opening View Votes modal (ensures updated avatars)
    const handleOpenVotesModal = async () => {
        setShowVotesModal(true);
        setLoadingVotes(true);
        
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/polls/${poll.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFreshPollData(data);
            }
        } catch (err) {
            console.error('Failed to fetch poll data:', err);
        } finally {
            setLoadingVotes(false);
        }
    };

    // Use fresh data for modal if available, otherwise fall back to prop data
    const modalPollData = freshPollData || poll;

    const getPercentage = (count) => {
        if (optimisticTotalVoters === 0) return 0;
        return Math.round((count / optimisticTotalVoters) * 100);
    };

    return (
        <div className="w-full max-w-[300px]">
            {/* Question */}
            <div className="mb-3">
                <p className={`font-medium ${isMe ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                    📊 {renderTextWithEmojis(poll.question)}
                </p>
                <div className={`flex items-center gap-1.5 mt-1 text-xs ${isMe ? 'text-violet-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span className="material-symbols-outlined text-[16px]">
                        {poll.is_multiple_choice ? 'checklist' : 'check_circle'}
                    </span>
                    <span>
                        {poll.is_multiple_choice ? 'Select one or more' : 'Select one'}
                    </span>
                </div>
            </div>

            {/* Options */}
            <div className="space-y-2">
                {optimisticOptions.map((option) => {
                    const isVoted = optimisticVotes.includes(option.id);
                    const percentage = getPercentage(option.vote_count);
                    
                    return (
                        <button
                            key={option.id}
                            onClick={() => handleOptionClick(option.id)}
                            disabled={optimisticClosed}
                            className={`
                                w-full relative px-3 py-2.5 rounded-lg text-left transition-all overflow-hidden
                                ${optimisticClosed 
                                    ? 'cursor-default' 
                                    : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
                                }
                                ${isVoted 
                                    ? (isMe 
                                        ? 'bg-white/30 border-2 border-white' 
                                        : 'bg-violet-100 dark:bg-violet-500/20 border-2 border-violet-500'
                                    )
                                    : (isMe 
                                        ? 'bg-white/10 border-2 border-white/20' 
                                        : 'bg-slate-50 dark:bg-slate-700/50 border-2 border-slate-200 dark:border-slate-600'
                                    )
                                }
                            `}
                        >
                            {/* Progress bar */}
                            {(hasVoted || optimisticClosed) && (
                                <div 
                                    className={`absolute inset-0 transition-all duration-300 ${
                                        isMe ? 'bg-white/20' : 'bg-violet-500/20'
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                />
                            )}
                            
                            <div className="relative flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {/* Checkbox/Radio indicator */}
                                    <div className={`
                                        w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all duration-150
                                        ${isVoted
                                            ? (isMe ? 'border-white bg-white' : 'border-violet-500 bg-violet-500')
                                            : (isMe ? 'border-white/50' : 'border-slate-400 dark:border-slate-500')
                                        }
                                    `}>
                                        {isVoted && (
                                            <span className={`material-symbols-outlined text-[12px] ${
                                                isMe ? 'text-violet-600' : 'text-white'
                                            }`}>check</span>
                                        )}
                                    </div>
                                    
                                    <span className={`text-sm truncate ${
                                        isMe ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                                    }`}>
                                        {renderTextWithEmojis(option.text)}
                                    </span>
                                </div>

                                {/* Vote count/percentage */}
                                {(hasVoted || optimisticClosed) && (
                                    <span className={`text-xs font-medium shrink-0 transition-all ${
                                        isMe ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'
                                    }`}>
                                        {percentage}%
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap gap-3 items-center justify-between">
                <span className={`text-xs ${isMe ? 'text-violet-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    {optimisticTotalVoters} vote{optimisticTotalVoters !== 1 ? 's' : ''}
                    {poll.is_anonymous && ' • Anonymous'}
                </span>
                
                <div className="flex items-center gap-2">
                    {/* View Votes Button - show if at least one vote exists and poll is not anonymous */}
                    {optimisticTotalVoters > 0 && !poll.is_anonymous && (
                        <button
                            onClick={handleOpenVotesModal}
                            className={`
                                px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1
                                ${isMe 
                                    ? 'bg-white/10 text-white hover:bg-white/20' 
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
                                }
                            `}
                        >
                            <span className="material-symbols-outlined text-[14px]">visibility</span>
                            View Votes
                        </button>
                    )}
                    
                    {!optimisticClosed && poll.created_by === user?.id && onClose && (
                        <button
                            onClick={handleClose}
                            className={`
                                px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                                ${isMe 
                                    ? 'text-white/70 hover:text-white hover:bg-white/10' 
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }
                            `}
                        >
                            Close Poll
                        </button>
                    )}
                </div>
            </div>

            {optimisticClosed && (
                <div className={`mt-2 text-xs flex items-center gap-1 ${
                    isMe ? 'text-violet-200' : 'text-slate-500 dark:text-slate-400'
                }`}>
                    <span className="material-symbols-outlined text-[14px]">lock</span>
                    Poll closed
                </div>
            )}

            {/* View Votes Modal */}
            {showVotesModal && (
                <div 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
                    onClick={() => setShowVotesModal(false)}
                >
                    <div 
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] overflow-hidden animate-in zoom-in-95 fade-in duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Poll Votes</h3>
                            <button 
                                onClick={() => setShowVotesModal(false)}
                                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-4 overflow-y-auto max-h-[60vh] custom-scrollbar">
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">{renderTextWithEmojis(modalPollData.question)}</p>
                            
                            {loadingVotes ? (
                                <div className="flex justify-center py-8">
                                    <span className="material-symbols-outlined animate-spin text-violet-500">progress_activity</span>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {modalPollData.options?.map((option) => (
                                        <div key={option.id} className="space-y-2">
                                            {/* Option Header */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                                    {renderTextWithEmojis(option.text)}
                                                </span>
                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    {option.vote_count} vote{option.vote_count !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            
                                            {/* Voters List */}
                                            {option.voters && option.voters.length > 0 ? (
                                                <div className="pl-2 space-y-1.5">
                                                    {option.voters.map((voter) => (
                                                        <div key={voter.id} className="flex items-center gap-2">
                                                            {voter.avatar_thumb_url ? (
                                                                <img 
                                                                    src={voter.avatar_thumb_url} 
                                                                    alt={voter.display_name}
                                                                    className="w-6 h-6 rounded-full object-cover"
                                                                />
                                                            ) : (
                                                                <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-white text-[10px] font-bold">
                                                                    {voter.display_name?.[0]?.toUpperCase()}
                                                                </div>
                                                            )}
                                                            <span className="text-sm text-slate-600 dark:text-slate-300">
                                                                {renderTextWithEmojis(voter.display_name)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-400 dark:text-slate-500 pl-2">No votes yet</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
