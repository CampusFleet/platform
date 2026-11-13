import React from "react";
import { cn } from "./cn";

export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-md mx-auto p-6 rounded-3xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-center space-y-2", className)}>
      {icon && <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-100 dark:bg-zinc-900 text-gray-400 flex items-center justify-center">{icon}</div>}
      <h2 className="text-lg font-black text-gray-900 dark:text-white">{title}</h2>
      {children && <div className="text-sm text-gray-500 dark:text-gray-400">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
