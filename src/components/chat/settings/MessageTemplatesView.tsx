"use client";

import React, { useState } from "react";
import { ArrowLeft, Plus, Trash2, MessageSquare } from "lucide-react";
import { ChatTemplate } from "@/types/chat";
import { NewTemplateModal } from "./NewTemplateModal";

interface MessageTemplatesViewProps {
  templates: ChatTemplate[];
  onAddTemplate: (template: Omit<ChatTemplate, "id" | "createdAt">) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onBack: () => void;
}

export function MessageTemplatesView({
  templates,
  onAddTemplate,
  onDeleteTemplate,
  onBack,
}: MessageTemplatesViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          Message templates
        </h2>
      </div>

      {/* Main Content (Matching Screenshot 3) */}
      <div className="p-4 space-y-4 max-w-md w-full">
        {/* Description paragraph */}
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Personal quick replies you can insert from the compose bar. Only you
          can see and manage these templates.
        </p>

        {/* Add Template Button */}
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-900 dark:text-white flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs hover:bg-gray-50 dark:hover:bg-gray-750"
        >
          <Plus className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          <span>Add template</span>
        </button>

        {/* List of Templates */}
        {templates.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No templates yet. Add your first one above.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 pt-1">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="p-3.5 rounded-2xl border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-850 hover:border-gray-300 dark:hover:border-gray-700 transition-colors shadow-2xs group flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {tpl.title}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      {tpl.useIn || "All chats"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                    {tpl.message}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDeleteTemplate(tpl.id)}
                  className="p-1.5 text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                  title="Delete template"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <NewTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={async (newTpl) => {
          await onAddTemplate(newTpl);
        }}
      />
    </div>
  );
}
