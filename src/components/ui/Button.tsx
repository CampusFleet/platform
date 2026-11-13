import React from "react";
import { cn } from "./cn";

const VARIANTS = {
  primary: "bg-blue-600 hover:bg-blue-500 text-white",
  success: "bg-emerald-600 hover:bg-emerald-500 text-white",
  danger: "bg-rose-600 hover:bg-rose-500 text-white",
  secondary: "bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-zinc-800",
  ghost: "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800",
} as const;
const SIZES = { sm: "px-3 py-2 text-xs rounded-xl", md: "px-4 py-3 text-sm rounded-xl", lg: "px-5 py-4 text-base rounded-2xl" } as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  block?: boolean;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", block, loading, className, disabled, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none min-w-0",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className
      )}
      {...rest}
    >
      {loading && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />}
      {children}
    </button>
  );
}
