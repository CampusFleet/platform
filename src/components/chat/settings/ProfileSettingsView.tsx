"use client";

import React, { useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { getInitials } from "@/types/chat";

interface ProfileSettingsViewProps {
  fullName: string;
  about: string;
  onSave: (updates: { about: string }) => Promise<boolean | void>;
  onBack: () => void;
}

export function ProfileSettingsView({
  fullName,
  about: initialAbout,
  onSave,
  onBack,
}: ProfileSettingsViewProps) {
  const [about, setAbout] = useState(
    initialAbout || "Hey there! I am using CampusFleet Chat."
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const maxChars = 140;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ about: about.trim() });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const initials = getInitials(fullName || "Aditya Pandey");

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-y-auto">
      {/* Top Header */}
      <div className="p-4 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800">
        <button
          onClick={onBack}
          type="button"
          className="p-1.5 -ml-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Profile</h2>
      </div>

      {/* Main Content (Matching Screenshot 1) */}
      <div className="p-6 flex flex-col items-center flex-1 max-w-sm w-full mx-auto">
        {/* Large Round Avatar */}
        <div className="w-20 h-20 rounded-full bg-[#E59866] dark:bg-[#D35400] text-white flex items-center justify-center font-bold text-2xl shadow-sm mb-3">
          {initials}
        </div>

        {/* User Name */}
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-6 text-center">
          {fullName || "Aditya Pandey"}
        </h3>

        {/* About Field */}
        <div className="w-full space-y-1.5 mb-6">
          <label className="text-xs font-normal text-gray-500 dark:text-gray-400 block">
            About
          </label>
          <div className="relative">
            <input
              type="text"
              maxLength={maxChars}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Hey there! I am using CampusFleet Chat."
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
            />
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 text-left">
            {about.length}/{maxChars}
          </div>
        </div>

        {/* Save Button */}
        <div className="w-full mt-auto pt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full py-3 px-4 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
              isSaved
                ? "bg-emerald-600 text-white"
                : "bg-[#9CA3AF] hover:bg-[#858D9A] dark:bg-gray-700 dark:hover:bg-gray-600 text-white active:scale-[0.99]"
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : isSaved ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
