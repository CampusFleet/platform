"use client";

import React from "react";
import { reportClientError } from "@/lib/client/report-error";

/**
 * Keeps a map failure from taking down the whole page. React error boundaries must be classes;
 * this is the one allowed class component (AGENTS.md "no new classes" exception).
 */
export class MapBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode; where: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    reportClientError(error, `map:${this.props.where}`);
  }
  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <div className="w-full h-full min-h-[160px] rounded-2xl bg-gray-100 dark:bg-zinc-900 flex items-center justify-center text-center p-4 text-xs text-gray-500">
            The map could not load. You can still search your address and pick a stop.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
