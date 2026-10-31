"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface BusLoadingScreenProps {
  message?: string;
  subtitle?: string;
  fullScreen?: boolean;
  compact?: boolean;
}

const TRANSIT_DISPATCH_MESSAGES = [
  "Synchronizing corridor schedules...",
  "Connecting to Campus Telematics Gateway...",
  "Calibrating real-time GPS fleet positions...",
  "Validating digital manifests and bookings...",
  "Optimizing campus transit routing...",
];

export default function BusLoadingScreen({
  message,
  subtitle = "Smart Fleet Gateway",
  fullScreen = true,
  compact = false,
}: BusLoadingScreenProps) {
  const [activeMessageIdx, setActiveMessageIdx] = useState(0);

  useEffect(() => {
    if (message) return;
    const interval = setInterval(() => {
      setActiveMessageIdx((prev) => (prev + 1) % TRANSIT_DISPATCH_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [message]);

  const currentMessage = message || TRANSIT_DISPATCH_MESSAGES[activeMessageIdx];

  const content = (
    <div
      className={`flex flex-col items-center justify-center select-none text-center ${
        compact ? "p-4" : "p-8 w-full max-w-md"
      }`}
    >
      {/* ── Dynamic Cartoon Bus Animation Stage ────────────────────────────── */}
      <div className="relative w-72 h-32 flex flex-col items-center justify-end overflow-hidden">
        {/* Speed Wind Streaks (Sky Blue & Cyan) */}
        <div className="absolute top-3 left-0 right-0 h-6 pointer-events-none overflow-hidden opacity-75">
          <div className="animate-wind-streak-1 absolute h-[2px] w-14 bg-gradient-to-r from-transparent via-sky-400 to-transparent top-1" />
          <div className="animate-wind-streak-2 absolute h-[1.5px] w-20 bg-gradient-to-r from-transparent via-blue-400 to-transparent top-3.5" />
        </div>

        {/* Playful Floating Cartoon Exhaust Dust Puffs */}
        <div className="absolute bottom-5 left-1 pointer-events-none opacity-60">
          <span className="inline-block w-2.5 h-2.5 bg-blue-200 dark:bg-blue-900/60 rounded-full animate-ping" style={{ animationDuration: "1.4s" }} />
        </div>

        {/* Bouncing Cartoon Bus Container */}
        <div className="relative z-10 animate-bus-bounce origin-bottom mb-2">
          {/* Headlight Beam Cone (projects forward to the right) */}
          <div className="absolute -right-20 top-7 w-24 h-12 bg-gradient-to-r from-amber-300/40 via-amber-200/15 to-transparent clip-headlight pointer-events-none" />

          {/* Creative Cartoonish Blue Bus SVG */}
          <svg
            width="176"
            height="72"
            viewBox="0 0 176 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-xl"
          >
            <defs>
              {/* Vibrant CampusFleet Blue Gradient */}
              <linearGradient id="chassisBlueGrad" x1="12" y1="6" x2="168" y2="48" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="60%" stopColor="#2563EB" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>

              {/* Roof Dome Sky Blue Gradient */}
              <linearGradient id="roofSkyGrad" x1="50" y1="3" x2="110" y2="8" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>

              {/* Windshield Glass Tint */}
              <linearGradient id="glassTint" x1="136" y1="17" x2="164" y2="34" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#0F172A" />
                <stop offset="100%" stopColor="#1E293B" />
              </linearGradient>
            </defs>

            {/* Bus Roof AC / Telematics Dome */}
            <rect x="50" y="4" width="60" height="6" rx="3" fill="url(#roofSkyGrad)" />
            <rect x="58" y="2" width="16" height="3" rx="1.5" fill="#0369A1" />
            {/* Blinking GPS Antenna Light */}
            <circle cx="104" cy="7" r="2" fill="#38BDF8" className="animate-pulse" />

            {/* Main Rounded Cartoon Bus Chassis */}
            <path
              d="M12 10C12 7.79 13.79 6 16 6H146C156 6 164 13 166 22L170 41C171 45 168 49 163 49H12C8.68 49 6 46.31 6 43V16C6 12.68 8.68 10 12 10Z"
              fill="url(#chassisBlueGrad)"
            />

            {/* Lower Chassis Midnight Trim Accent */}
            <path
              d="M6 39H170L167 46C166 48 164 49 162 49H12C8.68 49 6 46.31 6 43V39Z"
              fill="#0F172A"
            />

            {/* University Gold / CampusFleet Livery Ribbon */}
            <rect x="6" y="35" width="164" height="3.5" fill="#F59E0B" />

            {/* LED Destination Marquee Board */}
            <rect x="135" y="10" width="24" height="6.5" rx="1.5" fill="#090D16" />
            <rect x="137" y="11.8" width="20" height="3" rx="0.8" fill="#FDE047" className="animate-pulse" />

            {/* Front Windshield with Aerodynamic Slope */}
            <path
              d="M136 17H162L166 33H136V17Z"
              fill="url(#glassTint)"
            />
            {/* Windshield Specular Cartoon Glint */}
            <path
              d="M142 19L156 32H151L139 19H142Z"
              fill="white"
              fillOpacity="0.4"
            />

            {/* Passenger Side Windows with Rounded Cartoon Corners */}
            <rect x="15" y="15" width="23" height="16" rx="3" fill="#0F172A" fillOpacity="0.85" />
            <rect x="42" y="15" width="27" height="16" rx="3" fill="#0F172A" fillOpacity="0.85" />
            <rect x="73" y="15" width="27" height="16" rx="3" fill="#0F172A" fillOpacity="0.85" />
            <rect x="104" y="15" width="28" height="16" rx="3" fill="#0F172A" fillOpacity="0.85" />

            {/* Cartoon Window Reflection Lines */}
            <line x1="20" y1="16" x2="35" y2="30" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="47" y1="16" x2="66" y2="30" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="78" y1="16" x2="97" y2="30" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="109" y1="16" x2="129" y2="30" stroke="white" strokeOpacity="0.3" strokeWidth="1.5" strokeLinecap="round" />

            {/* Door Outline */}
            <rect x="104" y="15" width="14" height="32" rx="1.5" stroke="#334155" strokeWidth="0.8" fill="none" />

            {/* Front Headlight (Warm Amber/Yellow Eye) */}
            <path d="M168 39L170 43H167L166 39H168Z" fill="#FEF08A" />
            <circle cx="168" cy="41" r="2.8" fill="#FBBF24" />

            {/* Rear Taillight (Red LED) */}
            <rect x="5" y="39" width="2" height="5" rx="0.5" fill="#EF4444" />
            <circle cx="6" cy="41" r="1.5" fill="#F87171" className="animate-ping" style={{ animationDuration: "1.2s" }} />

            {/* Wheel Arches (Fenders) */}
            <path d="M26 49C26 41.5 33 36 42 36C51 36 58 41.5 58 49H26Z" fill="#0F172A" />
            <path d="M118 49C118 41.5 125 36 134 36C143 36 150 41.5 150 49H118Z" fill="#0F172A" />

            {/* Rear Chunky Cartoon Wheel (Spinning) */}
            <g transform="translate(42, 49)">
              <circle cx="0" cy="0" r="12" fill="#0F172A" />
              <circle cx="0" cy="0" r="9" fill="#1E293B" />
              <circle cx="0" cy="0" r="5" fill="#64748B" />
              <g className="animate-wheel-spin origin-center">
                <line x1="-8" y1="0" x2="8" y2="0" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="0" y1="-8" x2="0" y2="8" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="0" cy="0" r="2.5" fill="#FFFFFF" />
              </g>
            </g>

            {/* Front Chunky Cartoon Wheel (Spinning) */}
            <g transform="translate(134, 49)">
              <circle cx="0" cy="0" r="12" fill="#0F172A" />
              <circle cx="0" cy="0" r="9" fill="#1E293B" />
              <circle cx="0" cy="0" r="5" fill="#64748B" />
              <g className="animate-wheel-spin origin-center">
                <line x1="-8" y1="0" x2="8" y2="0" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="0" y1="-8" x2="0" y2="8" stroke="#E2E8F0" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="0" cy="0" r="2.5" fill="#FFFFFF" />
              </g>
            </g>
          </svg>
        </div>

        {/* ── Asphalt Road Track with Scrolling Dashes ──────────────── */}
        <div className="relative w-full h-3.5 flex items-center justify-center overflow-hidden">
          {/* Road Surface */}
          <div className="absolute inset-0 bg-slate-300 dark:bg-slate-800 rounded-full" />
          {/* Upper Curb Line */}
          <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-slate-400 dark:bg-slate-700" />
          {/* Infinite Scrolling White/Sky Lane Markers */}
          <div className="absolute inset-0 flex items-center overflow-hidden">
            <div className="flex gap-4 w-[200%] animate-road-scroll">
              {Array.from({ length: 18 }).map((_, idx) => (
                <span
                  key={idx}
                  className="h-[2px] w-5 bg-white dark:bg-sky-400 rounded-full shrink-0 opacity-90 shadow-xs"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Road Reflection Glow in CampusFleet Blue */}
        <div className="w-52 h-1 bg-blue-500/25 blur-sm rounded-full mt-0.5" />
      </div>

      {/* ── Status Typography & Live Pulse Indicator ──────────────── */}
      <div className="min-h-[56px] mt-4 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentMessage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              {currentMessage}
            </p>
          </motion.div>
        </AnimatePresence>

        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-semibold tracking-wide">
            {subtitle}
          </p>
        )}
      </div>

      {/* ── Precision Micro-Progress Bar in Vibrant Blue ───────────── */}
      <div className="w-56 h-1.5 bg-blue-100 dark:bg-slate-800 rounded-full mt-3 overflow-hidden relative shadow-inner">
        <div className="h-full bg-gradient-to-r from-blue-600 via-sky-400 to-cyan-400 rounded-full animate-indeterminate-progress" />
      </div>

      {/* ── Enterprise Capsule Badge ───────────────────────────────── */}
      <div className="mt-4 inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-blue-500/25 bg-blue-500/10 dark:bg-blue-500/15 text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-wider shadow-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        Live Telematics Pipeline
      </div>
    </div>
  );

  if (!fullScreen) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 dark:bg-neutral-950/95 backdrop-blur-md transition-colors">
      {content}
    </div>
  );
}
