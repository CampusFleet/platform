"use client";

import React, { useState } from "react";
import { MessageSquare, X } from "lucide-react";
import { ChatTemplate } from "@/types/chat";

interface NewTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (template: Omit<ChatTemplate, "id" | "createdAt">) => void;
}

export function NewTemplateModal({
  isOpen,
  onClose,
  onAdd,
}: NewTemplateModalProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [useIn, setUseIn] = useState("all");

  if (!isOpen) return null;

  const maxTitleChars = 200;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    onAdd({
      title: title.trim(),
      message: message.trim(),
      useIn: useIn === "all" ? "All chats" : useIn,
    });

    setTitle("");
    setMessage("");
    setUseIn("all");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-gray-800 p-6 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-5 right-5 p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              New template
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Save a personal quick reply you can insert from the compose bar.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Title
              </label>
              <span className="text-[11px] text-gray-400">
                {title.length}/{maxTitleChars}
              </span>
            </div>
            <input
              type="text"
              maxLength={maxTitleChars}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Welcome"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-white transition-all"
            />
          </div>

          {/* Message Field */}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
              Message
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Text inserted into the compose box"
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-white transition-all resize-none"
            />
          </div>

          {/* Use in Field */}
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1.5">
              Use in
            </label>
            <select
              value={useIn}
              onChange={(e) => setUseIn(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-white transition-all cursor-pointer"
            >
              <option value="all">All chats</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !message.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-black dark:bg-white text-white dark:text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-xs"
            >
              Add template
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
