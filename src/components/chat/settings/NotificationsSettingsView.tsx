"use client";

import React, { useState } from "react";
import { ArrowLeft, Bell, Volume2, Check } from "lucide-react";
import { NOTIFICATION_TONES, playNotificationTone } from "@/lib/chat-audio";
import { ChatUserSettings } from "@/types/chat";

interface NotificationsSettingsViewProps {
  settings: ChatUserSettings;
  onUpdate: (updates: Partial<ChatUserSettings>) => Promise<boolean | void>;
  onBack: () => void;
}

export function NotificationsSettingsView({
  settings,
  onUpdate,
  onBack,
}: NotificationsSettingsViewProps) {
  const [messageNotifications, setMessageNotifications] = useState(
    settings.notificationsEnabled ?? false
  );
  const [soundEnabled, setSoundEnabled] = useState(
    settings.soundEnabled ?? settings.notifications?.sound ?? true
  );
  const [selectedTone, setSelectedTone] = useState<string>(
    settings.notificationTone || settings.notifications?.tone || "Classic"
  );
  const [testSuccess, setTestSuccess] = useState(false);

  const handleToggleNotifications = async () => {
    const nextVal = !messageNotifications;
    setMessageNotifications(nextVal);

    if (nextVal && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setMessageNotifications(false);
          await onUpdate({
            notificationsEnabled: false,
            notifications: {
              ...(settings.notifications || { mentionsOnly: false }),
              sound: soundEnabled,
              desktop: false,
            },
          });
          return;
        }
      } else if (Notification.permission === "denied") {
        alert("Browser notifications are blocked. Please enable them in your browser settings.");
        setMessageNotifications(false);
        return;
      }
    }

    await onUpdate({
      notificationsEnabled: nextVal,
      notifications: {
        ...(settings.notifications || { mentionsOnly: false }),
        sound: soundEnabled,
        desktop: nextVal,
      },
    });
  };

  const handleToggleSound = async () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    if (nextVal) {
      playNotificationTone(selectedTone);
    }
    await onUpdate({
      soundEnabled: nextVal,
      notifications: {
        ...(settings.notifications || { mentionsOnly: false }),
        sound: nextVal,
      },
    });
  };

  const handleSelectTone = async (tone: string) => {
    setSelectedTone(tone);
    playNotificationTone(tone);
    await onUpdate({
      notificationTone: tone,
      notifications: {
        ...(settings.notifications || { mentionsOnly: false }),
        sound: soundEnabled,
        tone: tone,
      },
    });
  };

  const handleTestNotification = () => {
    playNotificationTone(selectedTone);
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("CampusFleet Chat", {
          body: "This is a test notification (check OS Do Not Disturb)",
          icon: "/favicon.ico",
        });
      } else if (Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          if (perm === "granted") {
            new Notification("CampusFleet Chat", {
              body: "This is a test notification (check OS Do Not Disturb)",
              icon: "/favicon.ico",
            });
          }
        });
      }
    }
    setTestSuccess(true);
    setTimeout(() => setTestSuccess(false), 2000);
  };

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
        <h2 className="text-base font-bold text-gray-900 dark:text-white">
          Notifications & privacy
        </h2>
      </div>

      {/* Main Content (Matching Screenshot 2) */}
      <div className="p-4 space-y-4 max-w-md w-full">
        {/* Item 1: Message notifications */}
        <div className="p-4 rounded-2xl border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-850 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="text-gray-800 dark:text-gray-200 flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Message notifications
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
                Pop-ups when this tab is in the background
              </div>
            </div>
          </div>
          {/* iOS Style Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={messageNotifications}
            onClick={handleToggleNotifications}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              messageNotifications ? "bg-black dark:bg-white" : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-900 shadow-md ring-0 transition duration-200 ease-in-out ${
                messageNotifications ? "translate-x-5 !bg-white dark:!bg-gray-900" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Item 2: Notification sounds */}
        <div className="p-4 rounded-2xl border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-850 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="text-gray-800 dark:text-gray-200 flex-shrink-0">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Notification sounds
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
                Play a sound for new messages
              </div>
            </div>
          </div>
          {/* iOS Style Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            onClick={handleToggleSound}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              soundEnabled ? "bg-black dark:bg-white" : "bg-gray-200 dark:bg-gray-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-900 shadow-md ring-0 transition duration-200 ease-in-out ${
                soundEnabled ? "translate-x-5 !bg-white dark:!bg-gray-900" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Section: Notification tone */}
        <div className="p-4 rounded-2xl border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-850 space-y-3 shadow-xs">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Notification tone
          </div>

          <div className="flex flex-wrap gap-2">
            {NOTIFICATION_TONES.map((tone) => {
              const isActive = selectedTone === tone;
              return (
                <button
                  key={tone}
                  type="button"
                  onClick={() => handleSelectTone(tone)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-black text-white dark:bg-white dark:text-black shadow-xs"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-750 dark:text-gray-300 border border-gray-200/80 dark:border-gray-700"
                  }`}
                >
                  {tone}
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-gray-400 dark:text-gray-500">
            Tap a tone to preview
          </div>
        </div>

        {/* Item 3: Test notification */}
        <button
          type="button"
          onClick={handleTestNotification}
          className="w-full text-left p-4 rounded-2xl border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors flex items-center justify-between gap-3 shadow-xs cursor-pointer group"
        >
          <div className="flex items-center gap-3.5">
            <div className="text-gray-800 dark:text-gray-200 flex-shrink-0 group-hover:scale-105 transition-transform">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>Test notification</span>
                {testSuccess && <Check className="w-3.5 h-3.5 text-emerald-600 animate-in fade-in" />}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-400 mt-0.5">
                Fires a pop-up now (check OS Do Not Disturb)
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
