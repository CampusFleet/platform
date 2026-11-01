"use client";

import React from "react";
import {
  ArrowLeft,
  User,
  Bell,
  MessageSquare,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { getInitials } from "@/types/chat";

export type SettingsSection = "main" | "profile" | "notifications" | "templates";

interface ChatSettingsMainViewProps {
  fullName: string;
  about: string;
  onSelectSection: (section: SettingsSection) => void;
  onBack: () => void;
}

export function ChatSettingsMainView({
  fullName,
  about,
  onSelectSection,
  onBack,
}: ChatSettingsMainViewProps) {
  const initials = getInitials(fullName || "Aditya Pandey");

  const handleRefreshApp = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-y-auto">
      {/* Top Header */}
      <div className="p-4 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800">
        <button
          onClick={onBack}
          type="button"
          className="p-1.5 -ml-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          aria-label="Go back to chat"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-bold text-gray-900 dark:text-white">
          Chat settings
        </h2>
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-3 max-w-md w-full">
        {/* Profile Card Preview */}
        <button
          type="button"
          onClick={() => onSelectSection("profile")}
          className="w-full text-left p-4 rounded-2xl border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center justify-between gap-3 shadow-2xs cursor-pointer group"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-full bg-[#E59866] dark:bg-[#D35400] text-white flex items-center justify-center font-bold text-base flex-shrink-0 shadow-xs">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {fullName || "Aditya Pandey"}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-400 truncate mt-0.5">
                {about || "Hey there! I am using CampusFleet Chat."}
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors flex-shrink-0" />
        </button>

        {/* Menu Items */}
        <div className="space-y-1.5 pt-2">
          {/* Item 1: Profile */}
          <button
            type="button"
            onClick={() => onSelectSection("profile")}
            className="w-full text-left p-3.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <User className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Profile
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  Name and about
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors flex-shrink-0" />
          </button>

          {/* Item 2: Notifications & privacy */}
          <button
            type="button"
            onClick={() => onSelectSection("notifications")}
            className="w-full text-left p-3.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Notifications & privacy
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  Alerts and notification sounds
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors flex-shrink-0" />
          </button>

          {/* Item 3: Message templates */}
          <button
            type="button"
            onClick={() => onSelectSection("templates")}
            className="w-full text-left p-3.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Message templates
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  Personal quick replies
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors flex-shrink-0" />
          </button>

          {/* Item 4: Refresh app */}
          <button
            type="button"
            onClick={handleRefreshApp}
            className="w-full text-left p-3.5 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  Refresh app
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  Hard reload in browser or PWA
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
