import React from "react";
import { cn } from "./cn";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 p-4 sm:p-5 min-w-0", className)} {...rest} />;
}

export function CardHeader({ title, subtitle, action, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 min-w-0 mb-3">
      {icon && <div className="w-10 h-10 shrink-0 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm sm:text-base font-black text-gray-900 dark:text-white truncate">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
