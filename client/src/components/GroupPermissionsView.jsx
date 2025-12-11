import React from 'react';

const GroupPermissionsView = ({ 
    permissions, 
    onPermissionChange, 
    onBack 
}) => {
    return (
        <div className="flex flex-col h-full bg-slate-900">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center gap-3">
                <button 
                    onClick={onBack}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <h3 className="text-white font-bold text-lg">Group Permissions</h3>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                {/* Toggles */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-200 font-medium">Edit Group Name</span>
                            <span className="text-xs text-slate-500">Allow members to change the group subject</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={permissions.allow_name_change} 
                                onChange={(e) => onPermissionChange('allow_name_change', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-200 font-medium">Edit Description</span>
                            <span className="text-xs text-slate-500">Allow members to change the group description</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={permissions.allow_description_change}
                                onChange={(e) => onPermissionChange('allow_description_change', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-200 font-medium">Add Members</span>
                            <span className="text-xs text-slate-500">Allow members to add other participants</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={permissions.allow_add_members}
                                onChange={(e) => onPermissionChange('allow_add_members', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                        </label>
                    </div>
                    
                    <div className="pt-4 border-t border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-200 font-medium">Send Messages</span>
                            <select 
                                className="bg-slate-800 text-xs text-white border border-slate-700 rounded px-2 py-1 outline-none focus:border-violet-500"
                                value={permissions.send_mode}
                                onChange={(e) => onPermissionChange('send_mode', e.target.value)}
                            >
                                <option value="everyone">Everyone</option>
                                <option value="admins_only">Admins Only</option>
                                <option value="owner_only">Owner Only</option>
                            </select>
                        </div>
                        <p className="text-xs text-slate-500">Choose who can send messages to this group</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GroupPermissionsView;
