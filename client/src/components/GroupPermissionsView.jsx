import React from 'react';

const GroupPermissionsView = ({ 
    permissions, 
    onPermissionChange, 
    onBack 
}) => {
    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900 transition-colors duration-300">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 transition-colors">
                <button 
                    onClick={onBack}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h3 className="text-slate-800 dark:text-white font-bold text-lg transition-colors">Group Permissions</h3>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {/* Toggles */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-700 dark:text-slate-200 font-medium transition-colors">Edit Group Name</span>
                            <span className="text-xs text-slate-500 dark:text-slate-500 transition-colors">Allow members to change the group subject</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={permissions.allow_name_change} 
                                onChange={(e) => onPermissionChange('allow_name_change', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 transition-colors"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-700 dark:text-slate-200 font-medium transition-colors">Edit Description</span>
                            <span className="text-xs text-slate-500 dark:text-slate-500 transition-colors">Allow members to change the group description</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={permissions.allow_description_change}
                                onChange={(e) => onPermissionChange('allow_description_change', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 transition-colors"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-700 dark:text-slate-200 font-medium transition-colors">Add Members</span>
                            <span className="text-xs text-slate-500 dark:text-slate-500 transition-colors">Allow members to add other participants</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={permissions.allow_add_members}
                                onChange={(e) => onPermissionChange('allow_add_members', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600 transition-colors"></div>
                        </label>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-700 dark:text-slate-200 font-medium transition-colors">Send Messages</span>
                            <select 
                                className="bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded px-2 py-1 outline-none focus:border-violet-500 transition-colors"
                                value={permissions.send_mode}
                                onChange={(e) => onPermissionChange('send_mode', e.target.value)}
                            >
                                <option value="everyone">Everyone</option>
                                <option value="admins_only">Admins Only</option>
                                <option value="owner_only">Owner Only</option>
                            </select>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-500 transition-colors">Choose who can send messages to this group</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupPermissionsView;
