"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  GraduationCap,
  Sparkles,
  RefreshCw,
  Info,
  Check,
  ChevronRight,
  BusFront,
  Sliders,
  ShieldCheck,
  Building,
  Users,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  X,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { CustomDropdown } from "@/components/common/CustomDropdown";

export interface TeacherClassItem {
  id: string;
  name: string;
  course: string;
  semester: string;
  year: string;
  section: string;
  department?: string;
  specialization?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  studentCount: number;
  activeCommuters: number;
}

export interface ShiftItem {
  id: string;
  name: string;
  type: string;
  start_time: string;
  end_time: string;
  direction?: string;
  is_special?: boolean;
}

export interface ClassShiftScheduleRow {
  id?: string;
  class_id: string;
  day_of_week: string;
  incoming_shift_id: string | null;
  outgoing_shift_id: string | null;
  is_today_off: boolean;
  notes?: string | null;
}

interface TeacherScheduleShiftViewProps {
  initialTeacher: {
    id: string;
    name: string;
    email?: string;
    role?: string;
  };
  initialClasses: TeacherClassItem[];
  initialShifts: ShiftItem[];
  initialSchedules: ClassShiftScheduleRow[];
}

const DAYS_OF_WEEK = [
  { key: "MONDAY", label: "Monday", short: "Mon" },
  { key: "TUESDAY", label: "Tuesday", short: "Tue" },
  { key: "WEDNESDAY", label: "Wednesday", short: "Wed" },
  { key: "THURSDAY", label: "Thursday", short: "Thu" },
  { key: "FRIDAY", label: "Friday", short: "Fri" },
  { key: "SATURDAY", label: "Saturday", short: "Sat" },
  { key: "SUNDAY", label: "Sunday", short: "Sun" },
];

export default function TeacherScheduleShiftView({
  initialTeacher,
  initialClasses,
  initialShifts,
  initialSchedules,
}: TeacherScheduleShiftViewProps) {
  // Selected active class
  const [selectedClassId, setSelectedClassId] = useState<string>(
    initialClasses[0]?.id || ""
  );

  // Schedules state keyed by `classId_dayOfWeek`
  const [schedulesMap, setSchedulesMap] = useState<
    Record<string, { incoming_shift_id: string | null; outgoing_shift_id: string | null; is_today_off: boolean; notes: string }>
  >(() => {
    const map: Record<string, any> = {};

    // Defaults from database
    initialSchedules.forEach((row) => {
      const key = `${row.class_id}_${row.day_of_week?.toUpperCase()}`;
      map[key] = {
        incoming_shift_id: row.incoming_shift_id || null,
        outgoing_shift_id: row.outgoing_shift_id || null,
        is_today_off: Boolean(row.is_today_off),
        notes: row.notes || "",
      };
    });

    // Populate defaults for any missing day per class
    const defaultIncoming =
      initialShifts.find((s) => s.direction === "HOME_TO_CAMPUS" || s.type === "MORNING")?.id ||
      initialShifts[0]?.id || "";
    const defaultOutgoing =
      initialShifts.find((s) => s.direction === "CAMPUS_TO_HOME" || s.type === "EVENING")?.id ||
      initialShifts[1]?.id ||
      defaultIncoming || "";
    const halfDayOutgoing =
      initialShifts.find((s) => s.type === "AFTERNOON" || (s.name || "").toLowerCase().includes("afternoon"))?.id ||
      defaultOutgoing;

    initialClasses.forEach((cls) => {
      DAYS_OF_WEEK.forEach((d) => {
        const key = `${cls.id}_${d.key}`;
        if (!map[key]) {
          const isSunday = d.key === "SUNDAY";
          const isSaturday = d.key === "SATURDAY";
          map[key] = {
            incoming_shift_id: isSunday ? null : defaultIncoming,
            outgoing_shift_id: isSunday ? null : isSaturday ? halfDayOutgoing : defaultOutgoing,
            is_today_off: isSunday,
            notes: "",
          };
        }
      });
    });

    return map;
  });

  // Bulk Apply Flag
  const [applyToAllClasses, setApplyToAllClasses] = useState(false);

  // Submission State
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Class currently selected
  const activeClass = useMemo(
    () => initialClasses.find((c) => c.id === selectedClassId) || initialClasses[0],
    [initialClasses, selectedClassId]
  );

  // Incoming vs Outgoing shift options
  const incomingShifts = useMemo(
    () =>
      initialShifts.filter(
        (s) => s.direction === "HOME_TO_CAMPUS" || s.type === "MORNING"
      ),
    [initialShifts]
  );

  const outgoingShifts = useMemo(
    () =>
      initialShifts.filter(
        (s) =>
          s.direction === "CAMPUS_TO_HOME" ||
          s.type === "EVENING" ||
          s.type === "AFTERNOON"
      ),
    [initialShifts]
  );

  // Format time (07:15:00 -> 07:15 AM)
  const formatTime = (timeStr?: string) => {
    if (!timeStr) return "";
    const [hours, minutes] = timeStr.split(":");
    const h = parseInt(hours, 10);
    const m = minutes || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };

  // Determine current day of week in IST
  const currentDayKey = useMemo(() => {
    const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const dayIndex = istDate.getUTCDay(); // 0 is Sunday, 1 is Monday ...
    const dayMap = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    return dayMap[dayIndex];
  }, []);

  // Update a specific day's field
  const handleDayChange = (
    dayKey: string,
    field: "incoming_shift_id" | "outgoing_shift_id" | "is_today_off" | "notes",
    value: any
  ) => {
    if (!selectedClassId) return;
    const targetKey = `${selectedClassId}_${dayKey}`;

    setSchedulesMap((prev) => {
      const current = prev[targetKey] || {
        incoming_shift_id: null,
        outgoing_shift_id: null,
        is_today_off: false,
        notes: "",
      };

      const next = { ...current, [field]: value };
      // Turning a day on: fill the class's usual shifts (most used on its other on-days, else the
      // first incoming / evening outgoing shift), so the day is not saved as "on" with no bus.
      if (field === "is_today_off" && value === false) {
        const others = DAYS_OF_WEEK.map((d) => prev[`${selectedClassId}_${d.key}`]).filter((d) => d && !d.is_today_off);
        const most = (k: "incoming_shift_id" | "outgoing_shift_id") => {
          const n = new Map<string, number>();
          for (const d of others) if (d![k]) n.set(d![k]!, (n.get(d![k]!) || 0) + 1);
          return Array.from(n.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        };
        if (!next.incoming_shift_id) next.incoming_shift_id = most("incoming_shift_id") || incomingShifts[0]?.id || null;
        if (!next.outgoing_shift_id) {
          next.outgoing_shift_id =
            most("outgoing_shift_id") || outgoingShifts.find((s) => s.type === "EVENING")?.id || outgoingShifts[0]?.id || null;
        }
      }
      return { ...prev, [targetKey]: next };
    });
  };

  // Preset Handlers
  const handleApplyPreset = (preset: "STANDARD" | "EXAM_HALFDAY" | "FULLDAY" | "ALL_OFF") => {
    if (!selectedClassId) return;

    const defaultIncoming =
      incomingShifts[0]?.id || initialShifts[0]?.id || "";
    const eveningOutgoing =
      outgoingShifts.find((s) => s.type === "EVENING")?.id ||
      outgoingShifts[0]?.id ||
      defaultIncoming || "";
    const halfDayOutgoing =
      outgoingShifts.find((s) => s.type === "AFTERNOON" || (s.name || "").toLowerCase().includes("afternoon"))?.id ||
      eveningOutgoing;

    const targetClassIds = applyToAllClasses
      ? initialClasses.map((c) => c.id)
      : [selectedClassId];

    setSchedulesMap((prev) => {
      const next = { ...prev };

      targetClassIds.forEach((cId) => {
        DAYS_OF_WEEK.forEach((d) => {
          const key = `${cId}_${d.key}`;
          const isSunday = d.key === "SUNDAY";
          const isSaturday = d.key === "SATURDAY";

          if (preset === "STANDARD") {
            next[key] = {
              incoming_shift_id: isSunday ? null : defaultIncoming,
              outgoing_shift_id: isSunday ? null : isSaturday ? halfDayOutgoing : eveningOutgoing,
              is_today_off: isSunday,
              notes: isSaturday ? "Saturday half-day session" : "",
            };
          } else if (preset === "EXAM_HALFDAY") {
            next[key] = {
              incoming_shift_id: isSunday ? null : defaultIncoming,
              outgoing_shift_id: isSunday ? null : halfDayOutgoing,
              is_today_off: isSunday,
              notes: "Mid-term / Exam half-day schedule",
            };
          } else if (preset === "FULLDAY") {
            next[key] = {
              incoming_shift_id: isSunday ? null : defaultIncoming,
              outgoing_shift_id: isSunday ? null : eveningOutgoing,
              is_today_off: isSunday,
              notes: "Full day lecture schedule",
            };
          } else if (preset === "ALL_OFF") {
            next[key] = {
              incoming_shift_id: null,
              outgoing_shift_id: null,
              is_today_off: true,
              notes: "Academic recess / No transit scheduled",
            };
          }
        });
      });

      return next;
    });

    setSuccessMessage(`Preset applied to ${targetClassIds.length === 1 ? "selected class" : "all assigned classes"}. Remember to click "Save Shift Schedule" to commit.`);
  };

  // Submit and Save
  const handleSaveSchedule = async () => {
    if (!selectedClassId) return;

    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const targetClassIds = applyToAllClasses
      ? initialClasses.map((c) => c.id)
      : [selectedClassId];

    // A day with classes needs at least one bus shift; otherwise students get no bus that day.
    const missing = DAYS_OF_WEEK.filter((d) => {
      const s = schedulesMap[`${selectedClassId}_${d.key}`];
      return s && !s.is_today_off && !s.incoming_shift_id && !s.outgoing_shift_id;
    }).map((d) => d.label);
    if (missing.length) {
      setErrorMessage(`Pick an incoming or outgoing shift for ${missing.join(", ")}, or mark ${missing.length === 1 ? "it" : "them"} as a day off.`);
      setIsSaving(false);
      return;
    }

    try {
      // Gather schedule array for selected class
      const schedulesPayload = DAYS_OF_WEEK.map((d) => {
        const key = `${selectedClassId}_${d.key}`;
        const dayState = schedulesMap[key] || {
          incoming_shift_id: null,
          outgoing_shift_id: null,
          is_today_off: false,
          notes: "",
        };

        return {
          day_of_week: d.key,
          incoming_shift_id: dayState.is_today_off ? null : dayState.incoming_shift_id,
          outgoing_shift_id: dayState.is_today_off ? null : dayState.outgoing_shift_id,
          is_today_off: dayState.is_today_off,
          notes: dayState.notes || null,
        };
      });

      const res = await fetch("/api/teacher/schedule-shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classIds: targetClassIds,
          schedules: schedulesPayload,
        }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || "Failed to update academic shift schedule.");
      }

      setSuccessMessage(
        result.message ||
          `Shift schedule saved successfully for ${targetClassIds.length} academic class(es). Transit engine eligibility synchronized.`
      );
    } catch (err: any) {
      console.error("Save shift schedule error:", err);
      setErrorMessage(err.message || "Failed to save shift schedule. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 pb-24">
      {/* Universal Header with Navigation */}
      <UnifiedAppHeader
        portalTitle="CampusFleet"
        portalSubtitle="Faculty Transit & Academic Desk"
        navLinks={[
          { href: "/teacher", label: "Teacher Desk" },
          { href: "/teacher/attendance", label: "Attendance" },
          { href: "/teacher/schedule", label: "Schedule Shift" },
          { href: "/teacher/gate-passes", label: "Gate Passes" },
          { href: "/teacher/commute", label: "My Commute" },
        ]}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back Link Breadcrumb */}
        <div className="flex items-center justify-between">
          <Link
            href="/teacher"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
            <span>Back to Teacher Desk</span>
          </Link>
        </div>
        {/* Alerts / Feedback Banners */}
        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 text-rose-600 hover:text-rose-800 dark:text-rose-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* HERO HEADER: Human Standard Clean Card */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Academic Shift Management</span>
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Transit Engine Live Sync</span>
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Academic Class Shift Scheduler
              </h1>

              <p className="text-sm text-slate-600 dark:text-zinc-400 max-w-3xl leading-relaxed">
                Configure incoming and outgoing transit shifts for your assigned academic classes.
                The fleet transit engine synchronizes these lecture windows to validate real-time student bus boarding eligibility at university transit gates.
              </p>
            </div>

            {/* Teacher Profile Snapshot */}
            <div className="flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 self-start lg:self-center flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {initialTeacher.name.charAt(0).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>{initialTeacher.name}</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-slate-200 dark:bg-zinc-700 text-[10px] font-semibold text-slate-700 dark:text-zinc-300 uppercase">
                    Faculty
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate max-w-[180px]">
                  {initialTeacher.email || "Faculty Coordinator"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* IF NO CLASSES ARE ALLOCATED TO TEACHER */}
        {initialClasses.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-10 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <GraduationCap className="w-8 h-8" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                No Academic Classes Assigned
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                Your faculty account currently has no academic class sections mapped in the university registry.
                Shift scheduling is tied directly to your designated classes.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/teacher"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold transition-all shadow-xs"
              >
                <span>Return to Teacher Console</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* CLASS SELECTOR TABS */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-600 dark:text-zinc-400" />
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                    Your Assigned Academic Classes ({initialClasses.length})
                  </span>
                </div>

                {initialClasses.length > 1 && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyToAllClasses}
                      onChange={(e) => setApplyToAllClasses(e.target.checked)}
                      className="rounded border-slate-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span>Apply changes to all my classes</span>
                  </label>
                )}
              </div>

              {/* Class Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {initialClasses.map((cls) => {
                  const isSelected = cls.id === selectedClassId;
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => setSelectedClassId(cls.id)}
                      className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? "bg-white dark:bg-zinc-900 border-indigo-600 dark:border-indigo-500 shadow-md ring-2 ring-indigo-500/15"
                          : "bg-white dark:bg-zinc-900/60 border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 uppercase">
                              {cls.semester || "Semester"}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60">
                              Sec {cls.section}
                            </span>
                            {cls.isPrimary && (
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-extrabold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200">
                                Primary
                              </span>
                            )}
                          </div>

                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {cls.name}
                          </h4>

                          <div className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                            {cls.course} • {cls.year}
                          </div>
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {cls.studentCount}
                          </div>
                          <div className="text-[10px] text-slate-400">Students</div>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 dark:text-zinc-400">
                          Commuters: <strong className="text-slate-700 dark:text-zinc-200">{cls.activeCommuters}</strong>
                        </span>
                        {isSelected ? (
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Selected
                          </span>
                        ) : (
                          <span className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300">
                            Configure →
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PRESETS & BATCH TOOLBAR */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-slate-700 dark:text-zinc-300" />
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-zinc-200">
                    Quick Operational Presets
                  </span>
                  <span className="text-slate-400 text-xs hidden md:inline">
                    (1-click apply common campus schedules)
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Target:{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {applyToAllClasses ? `All ${initialClasses.length} Classes` : activeClass?.name}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleApplyPreset("STANDARD")}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 bg-slate-50/70 hover:bg-slate-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold transition-all text-left flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Standard Week
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Mon-Fri Full, Sat Half, Sun Off
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset("EXAM_HALFDAY")}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 bg-slate-50/70 hover:bg-slate-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold transition-all text-left flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Exam / Half-Day
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Mon-Sat Half-Day Departure
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset("FULLDAY")}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 bg-slate-50/70 hover:bg-slate-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold transition-all text-left flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    Extended Week
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    Mon-Sat Full-Day Departure
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset("ALL_OFF")}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-slate-300 dark:hover:border-zinc-600 bg-slate-50/70 hover:bg-slate-100 dark:bg-zinc-800/40 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 text-xs font-semibold transition-all text-left flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    Recess / All Off
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                    All days off (Holiday / Break)
                  </span>
                </button>
              </div>
            </div>

            {/* WEEKLY SHIFT MATRIX (MONDAY TO SUNDAY) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-slate-700 dark:text-zinc-300" />
                  <h3 className="font-black text-sm uppercase tracking-wider text-slate-900 dark:text-white">
                    Weekly Shift Timetable for {activeClass?.name}
                  </h3>
                </div>

                <div className="text-xs text-slate-500 dark:text-zinc-400">
                  7-Day Curricular Schedule
                </div>
              </div>

              {/* Day Cards Stack */}
              <div className="space-y-3">
                {DAYS_OF_WEEK.map((day) => {
                  const scheduleKey = `${selectedClassId}_${day.key}`;
                  const currentDayData = schedulesMap[scheduleKey] || {
                    incoming_shift_id: null,
                    outgoing_shift_id: null,
                    is_today_off: day.key === "SUNDAY",
                    notes: "",
                  };

                  const isToday = currentDayKey === day.key;
                  const isOff = currentDayData.is_today_off;

                  const selectedIncoming = initialShifts.find(
                    (s) => s.id === currentDayData.incoming_shift_id
                  );
                  const selectedOutgoing = initialShifts.find(
                    (s) => s.id === currentDayData.outgoing_shift_id
                  );

                  return (
                    <div
                      key={day.key}
                      className={`p-5 rounded-2xl border transition-all ${
                        isToday
                          ? "ring-2 ring-indigo-500/20 border-indigo-400 dark:border-indigo-600 bg-white dark:bg-zinc-900 shadow-sm"
                          : isOff
                          ? "bg-slate-50/70 dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800 opacity-80"
                          : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 shadow-xs"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Day Info & Off Toggle */}
                        <div className="flex items-center justify-between lg:justify-start gap-4 min-w-[200px]">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-base text-slate-900 dark:text-white">
                                {day.label}
                              </span>
                              {isToday && (
                                <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold uppercase tracking-wider">
                                  Today
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                              {isOff ? (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                  No Lecture / Off Day
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  Class In Session
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Toggle switch for Day Off vs Active */}
                          <button
                            type="button"
                            onClick={() =>
                              handleDayChange(day.key, "is_today_off", !isOff)
                            }
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              isOff
                                ? "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700 hover:bg-slate-200"
                                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
                            }`}
                          >
                            {isOff ? "Enable Classes" : "Mark Day Off"}
                          </button>
                        </div>

                        {/* Shift Selectors (Active Days) or Off State */}
                        {!isOff ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 flex-1">
                            {/* 1. Incoming Shift (Arrival) */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 flex items-center gap-1.5 uppercase">
                                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Incoming Shift (Morning)</span>
                              </label>

                              <CustomDropdown
                                value={currentDayData.incoming_shift_id || ""}
                                onChange={(val) =>
                                  handleDayChange(
                                    day.key,
                                    "incoming_shift_id",
                                    val || null
                                  )
                                }
                                placeholder="-- Select Incoming Shift --"
                                size="sm"
                                options={[
                                  { value: "", label: "-- Select Incoming Shift --" },
                                  ...incomingShifts.map((s) => ({
                                    value: s.id,
                                    label: `${s.name} (${formatTime(s.start_time)} - ${formatTime(s.end_time)})`,
                                  })),
                                ]}
                              />

                              {selectedIncoming && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Arrival window: {formatTime(selectedIncoming.start_time)} - {formatTime(selectedIncoming.end_time)}
                                </div>
                              )}
                            </div>

                            {/* 2. Outgoing Shift (Departure) */}
                            <div className="space-y-1">
                              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 flex items-center gap-1.5 uppercase">
                                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
                                <span>Outgoing Shift (Return)</span>
                              </label>

                              <CustomDropdown
                                value={currentDayData.outgoing_shift_id || ""}
                                onChange={(val) =>
                                  handleDayChange(
                                    day.key,
                                    "outgoing_shift_id",
                                    val || null
                                  )
                                }
                                placeholder="-- Select Outgoing Shift --"
                                size="sm"
                                options={[
                                  { value: "", label: "-- Select Outgoing Shift --" },
                                  ...outgoingShifts.map((s) => ({
                                    value: s.id,
                                    label: `${s.name} (${formatTime(s.start_time)} - ${formatTime(s.end_time)})`,
                                  })),
                                ]}
                              />

                              {selectedOutgoing && (
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Departure window: {formatTime(selectedOutgoing.start_time)} - {formatTime(selectedOutgoing.end_time)}
                                </div>
                              )}
                            </div>

                            {/* 3. Operational Notes / Reason */}
                            <div className="space-y-1 sm:col-span-2 md:col-span-1">
                              <label className="text-[11px] font-bold text-slate-600 dark:text-zinc-400 flex items-center gap-1.5 uppercase">
                                <Info className="w-3.5 h-3.5 text-slate-400" />
                                <span>Curricular Notes (Optional)</span>
                              </label>

                              <input
                                type="text"
                                value={currentDayData.notes || ""}
                                onChange={(e) =>
                                  handleDayChange(day.key, "notes", e.target.value)
                                }
                                placeholder="e.g. Lab day / Delayed departure"
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-slate-100/70 dark:bg-zinc-800/40 rounded-xl border border-slate-200/80 dark:border-zinc-800 flex-1 flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
                            <span>
                              No lecture transit required on {day.label}. Student bus boarding passes will be inactive.
                            </span>
                            <span className="text-[11px] font-semibold text-slate-400">
                              Off Day
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SAVE BAR & SUBMISSION */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 sticky bottom-4 z-20">
              <div className="space-y-1 text-center sm:text-left">
                <div className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center justify-center sm:justify-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Ready to Commit Academic Timetable?</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Updates propagate to student passes and physical fleet demand intelligence instantly.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveSchedule}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to Transit Engine...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>
                        Save Shift Schedule{" "}
                        {applyToAllClasses ? `(All ${initialClasses.length} Classes)` : `(${activeClass?.section})`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* TRANSIT INTELLIGENCE FOOTER CARD */}
            <div className="p-5 rounded-3xl bg-slate-100/80 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-zinc-200">
                  How Class Shift Scheduling Integrates with CampusFleet
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                When you specify the incoming and outgoing shifts for an academic section, the transit engine verifies student QR boarding passes against these exact operational hours.
                Changes made here immediately synchronize with the conductor boarding scanners and driver passenger rosters.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
