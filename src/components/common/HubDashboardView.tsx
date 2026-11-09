import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface HubModule {
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  badge?: string;
  badgeColor?: string;
}

interface HubDashboardViewProps {
  title: string;
  subtitle: string;
  modules: HubModule[];
  headerRight?: React.ReactNode;
}

export function HubDashboardView({ title, subtitle, modules, headerRight }: HubDashboardViewProps) {
  return (
    <div className="max-w-6xl mx-auto py-10 px-4 sm:px-6 animate-in fade-in duration-300">
      <div className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-medium text-gray-900 dark:text-white mb-2">
            {title}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((mod, idx) => {
          const Icon = mod.icon;
          return (
            <Link
              key={idx}
              href={mod.href}
              className="group flex flex-col justify-between p-6 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors rounded-lg min-h-[160px]"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-md text-gray-600 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {mod.badge && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                        mod.badgeColor || "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                      }`}>
                        {mod.badge}
                      </span>
                    )}
                    <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-700 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" />
                  </div>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                  {mod.title}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {mod.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
