"use client";

import React, { useState, useMemo } from "react";
import {
  X,
  Info,
  Users,
  Image as ImageIcon,
  Star,
  MessageSquare,
  Archive,
  VolumeX,
  MinusCircle,
  LogOut,
  Trash2,
  Search,
  FileText,
  Check,
} from "lucide-react";
import { ChatConversation, ChatMessage } from "@/types/chat";

interface GroupDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  currentUserRole?: string;
  onClearChat?: () => void;
  onMuteToggle?: () => void;
  onStarToggle?: () => void;
}

type TabType = "info" | "members" | "media" | "starred";

interface MemberItem {
  id: string;
  name: string;
  role: string;
  roleBadge: "OWNER" | "ADMIN" | "DISPATCHER" | "TEACHER" | "DRIVER" | "CONDUCTOR" | "MEMBER";
  initials: string;
  avatarBg: string;
  lastSeen: string;
}

export function GroupDetailsModal({
  isOpen,
  onClose,
  conversation,
  messages,
  currentUserRole = "admin",
  onClearChat,
  onMuteToggle,
  onStarToggle,
}: GroupDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("info");
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [mediaSubTab, setMediaSubTab] = useState<"media" | "docs">("media");
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  if (!isOpen || !conversation) return null;

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 2500);
  };

  // Generate contextual members based on channel category
  const membersList: MemberItem[] = useMemo(() => {
    if (conversation.id === "ops-dispatch") {
      return [
        { id: "m1", name: "Operations Director", role: "admin", roleBadge: "OWNER", initials: "OD", avatarBg: "bg-blue-600 text-white", lastSeen: "Online" },
        { id: "m2", name: "Central Transport Dispatcher", role: "transport_admin", roleBadge: "DISPATCHER", initials: "CD", avatarBg: "bg-indigo-600 text-white", lastSeen: "last seen today at 09:20" },
        { id: "m3", name: "Fleet Telematics Bot", role: "system", roleBadge: "ADMIN", initials: "TB", avatarBg: "bg-emerald-600 text-white", lastSeen: "Always active" },
        { id: "m4", name: "Rajesh Kumar (Bus 49 Driver)", role: "driver", roleBadge: "DRIVER", initials: "RK", avatarBg: "bg-amber-600 text-white", lastSeen: "last seen today at 08:45" },
        { id: "m5", name: "Suresh Sharma (Bus 37 Driver)", role: "driver", roleBadge: "DRIVER", initials: "SS", avatarBg: "bg-teal-600 text-white", lastSeen: "last seen yesterday at 19:30" },
        { id: "m6", name: "Amit Bisht (Lead Conductor)", role: "conductor", roleBadge: "CONDUCTOR", initials: "AB", avatarBg: "bg-purple-600 text-white", lastSeen: "last seen today at 07:15" },
      ];
    }

    if (conversation.id === "emergency-sos") {
      return [
        { id: "e1", name: "Campus Security Desk", role: "admin", roleBadge: "OWNER", initials: "CS", avatarBg: "bg-rose-600 text-white", lastSeen: "Online" },
        { id: "e2", name: "Emergency Incident Commander", role: "transport_admin", roleBadge: "ADMIN", initials: "IC", avatarBg: "bg-red-700 text-white", lastSeen: "Online" },
        { id: "e3", name: "Rapid Response Unit", role: "transport_manager", roleBadge: "DISPATCHER", initials: "RR", avatarBg: "bg-amber-600 text-white", lastSeen: "Standby 24/7" },
        { id: "e4", name: "Chief Transport Warden", role: "transport_admin", roleBadge: "ADMIN", initials: "CW", avatarBg: "bg-blue-700 text-white", lastSeen: "last seen today at 09:05" },
      ];
    }

    if (conversation.id === "fleet-maintenance") {
      return [
        { id: "f1", name: "Head of Fleet Engineering", role: "transport_admin", roleBadge: "OWNER", initials: "HE", avatarBg: "bg-amber-600 text-white", lastSeen: "Online" },
        { id: "f2", name: "Depot Chief Mechanic", role: "transport_manager", roleBadge: "ADMIN", initials: "CM", avatarBg: "bg-slate-700 text-white", lastSeen: "last seen today at 08:10" },
        { id: "f3", name: "OBD-II Telematics Health", role: "system", roleBadge: "ADMIN", initials: "TH", avatarBg: "bg-emerald-600 text-white", lastSeen: "Always active" },
        { id: "f4", name: "Workshop Duty Officer", role: "transport_manager", roleBadge: "MEMBER", initials: "WD", avatarBg: "bg-blue-600 text-white", lastSeen: "last seen yesterday at 18:00" },
      ];
    }

    if (conversation.category === "bus" || conversation.name.startsWith("Bus ")) {
      const busNum = conversation.busNumber || conversation.name.replace(/\D/g, "") || "49";
      return [
        { id: "b1", name: `Bus ${busNum} Primary Driver`, role: "driver", roleBadge: "DRIVER", initials: "DR", avatarBg: "bg-indigo-600 text-white", lastSeen: "Online (Driving)" },
        { id: "b2", name: `Bus ${busNum} Conductor`, role: "conductor", roleBadge: "CONDUCTOR", initials: "CO", avatarBg: "bg-amber-600 text-white", lastSeen: "last seen today at 09:12" },
        { id: "b3", name: "Transport Operations Desk", role: "transport_admin", roleBadge: "ADMIN", initials: "CF", avatarBg: "bg-blue-600 text-white", lastSeen: "Online" },
        { id: "b4", name: "Aditya Pandey (Commuter)", role: "student", roleBadge: "MEMBER", initials: "AP", avatarBg: "bg-emerald-600 text-white", lastSeen: "last seen today at 09:25" },
        { id: "b5", name: "Priya Sharma (Commuter)", role: "student", roleBadge: "MEMBER", initials: "PS", avatarBg: "bg-rose-600 text-white", lastSeen: "last seen yesterday at 21:05" },
        { id: "b6", name: "Rohan Verma (Commuter)", role: "student", roleBadge: "MEMBER", initials: "RV", avatarBg: "bg-purple-600 text-white", lastSeen: "last seen today at 08:30" },
      ];
    }

    if (conversation.category === "class") {
      return [
        { id: "c1", name: "Dr. Rajesh Kumar Pokhriyal", role: "teacher", roleBadge: "OWNER", initials: "DR", avatarBg: "bg-rose-500 text-white", lastSeen: "last seen yesterday at 20:19" },
        { id: "c2", name: "Prof. Ananya Sen (Coordinator)", role: "teacher", roleBadge: "ADMIN", initials: "AS", avatarBg: "bg-emerald-600 text-white", lastSeen: "last seen today at 08:43" },
        { id: "c3", name: "Adhishree Gupta", role: "student", roleBadge: "MEMBER", initials: "AG", avatarBg: "bg-emerald-500 text-white", lastSeen: "last seen today at 08:43" },
        { id: "c4", name: "Ria Kataria", role: "student", roleBadge: "MEMBER", initials: "RK", avatarBg: "bg-slate-500 text-white", lastSeen: "last seen yesterday at 14:57" },
        { id: "c5", name: "Aditya Punetha", role: "student", roleBadge: "MEMBER", initials: "AP", avatarBg: "bg-amber-500 text-white", lastSeen: "last seen Friday at 23:51" },
        { id: "c6", name: "Sidh Khurana", role: "student", roleBadge: "MEMBER", initials: "SK", avatarBg: "bg-stone-500 text-white", lastSeen: "last seen yesterday at 14:55" },
      ];
    }

    // Default / Main community
    return [
      { id: "u1", name: "CampusFleet Operations Desk", role: "admin", roleBadge: "OWNER", initials: "CF", avatarBg: "bg-blue-600 text-white", lastSeen: "Online" },
      { id: "u2", name: "Transport Admin Lead", role: "transport_admin", roleBadge: "ADMIN", initials: "TA", avatarBg: "bg-indigo-600 text-white", lastSeen: "Online" },
      { id: "u3", name: "Fleet Dispatch Manager", role: "transport_manager", roleBadge: "DISPATCHER", initials: "DM", avatarBg: "bg-amber-600 text-white", lastSeen: "last seen today at 09:15" },
      { id: "u4", name: "Aditya Pandey", role: "student", roleBadge: "MEMBER", initials: "AP", avatarBg: "bg-emerald-600 text-white", lastSeen: "Online" },
      { id: "u5", name: "Nikhil Singh Bisht", role: "student", roleBadge: "MEMBER", initials: "NB", avatarBg: "bg-purple-600 text-white", lastSeen: "last seen yesterday at 18:40" },
      { id: "u6", name: "Bhavya Agarwal", role: "student", roleBadge: "MEMBER", initials: "BA", avatarBg: "bg-rose-600 text-white", lastSeen: "last seen Thursday at 12:20" },
    ];
  }, [conversation]);

  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return membersList;
    const q = memberSearchQuery.toLowerCase();
    return membersList.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.roleBadge.toLowerCase().includes(q)
    );
  }, [membersList, memberSearchQuery]);

  // Extract media and documents from messages
  const mediaItems = useMemo(() => {
    const list: { id: string; url: string; name?: string; type: string; date: string }[] = [];
    messages.forEach((m) => {
      if (m.attachments && m.attachments.length > 0) {
        m.attachments.forEach((a, i) => {
          list.push({
            id: `${m.id}-${i}`,
            url: a.url,
            name: a.name || `Attachment ${i + 1}`,
            type: a.type || "image",
            date: m.createdAt || new Date().toISOString(),
          });
        });
      }
    });

    // Provide representative samples if no media attached yet
    if (list.length === 0) {
      return [
        { id: "samp-1", url: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=300&q=80", name: "Bus Gate Halt.jpg", type: "image", date: "OCTOBER 2026" },
        { id: "samp-2", url: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=300&q=80", name: "Campus Depot Fleet.jpg", type: "image", date: "OCTOBER 2026" },
        { id: "samp-3", url: "https://images.unsplash.com/photo-1509744645300-a2098b11871a?w=300&q=80", name: "Boarding Pass QR.jpg", type: "image", date: "OCTOBER 2026" },
        { id: "samp-4", url: "https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?w=300&q=80", name: "Route Corridor Map.jpg", type: "image", date: "OCTOBER 2026" },
        { id: "samp-5", url: "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=300&q=80", name: "Morning Shift Queue.jpg", type: "image", date: "OCTOBER 2026" },
        { id: "samp-6", url: "https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?w=300&q=80", name: "Digital Telematics.jpg", type: "image", date: "OCTOBER 2026" },
      ];
    }
    return list;
  }, [messages]);

  const docItems = useMemo(() => {
    return [
      { id: "doc-1", title: "Semester Bus Schedule & Shift Matrix.pdf", size: "2.4 MB", date: "24 Oct 2026" },
      { id: "doc-2", title: "RFID Tap & Digital Boarding Pass Policy.pdf", size: "1.1 MB", date: "15 Oct 2026" },
      { id: "doc-3", title: "Campus Gate Pass Guidelines.pdf", size: "850 KB", date: "02 Oct 2026" },
    ];
  }, []);

  const starredCount = useMemo(() => {
    return messages.filter((m) => (m as any).isStarred).length;
  }, [messages]);

  const memberRoleTag = currentUserRole === "admin" || currentUserRole === "transport_admin" ? "ADMIN" : "MEMBER";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-150 dark:border-gray-800 overflow-hidden flex flex-col md:flex-row h-[580px] max-h-[92vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ======================================================== */}
        {/* LEFT COLUMN: Navigation Sidebar (CampusFleet Group)     */}
        {/* ======================================================== */}
        <div className="w-full md:w-48 bg-gray-50/70 dark:bg-gray-850/60 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800 p-3 sm:p-4 flex flex-row md:flex-col gap-1 flex-shrink-0">
          <div className="hidden md:block text-[11px] font-bold text-gray-400 dark:text-gray-500 tracking-wider uppercase px-2.5 py-1.5 mb-1">
            Group
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={`flex-1 md:flex-initial flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "info"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-2xs font-semibold"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/60 dark:hover:bg-gray-800/40"
            }`}
          >
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>Info</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={`flex-1 md:flex-initial flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "members"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-2xs font-semibold"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/60 dark:hover:bg-gray-800/40"
            }`}
          >
            <Users className="w-4 h-4 flex-shrink-0" />
            <span>Members</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("media")}
            className={`flex-1 md:flex-initial flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "media"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-2xs font-semibold"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/60 dark:hover:bg-gray-800/40"
            }`}
          >
            <ImageIcon className="w-4 h-4 flex-shrink-0" />
            <span>Media</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("starred")}
            className={`flex-1 md:flex-initial flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              activeTab === "starred"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-2xs font-semibold"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/60 dark:hover:bg-gray-800/40"
            }`}
          >
            <Star className="w-4 h-4 flex-shrink-0" />
            <span>Starred</span>
          </button>
        </div>

        {/* ======================================================== */}
        {/* RIGHT COLUMN: Tab Content                                */}
        {/* ======================================================== */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-900 overflow-hidden relative">
          {/* Top Close Button */}
          <button
            onClick={onClose}
            type="button"
            className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors z-20 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Action Notification Banner */}
          {actionNotice && (
            <div className="absolute top-3 left-6 right-14 z-30 bg-gray-900 text-white dark:bg-white dark:text-black text-xs font-medium py-1.5 px-3 rounded-xl shadow-md flex items-center gap-2 animate-in fade-in duration-150">
              <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
              <span>{actionNotice}</span>
            </div>
          )}

          {/* ---------------------------------------------------- */}
          {/* TAB 1: INFO (Matching Screenshots 1 & 2)             */}
          {/* ---------------------------------------------------- */}
          {activeTab === "info" && (
            <div className="flex-1 flex flex-col overflow-y-auto">
              <div className="px-6 pt-5 pb-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Group info</h3>
              </div>

              <div className="p-6 pt-2 space-y-6">
                {/* Large Center Avatar */}
                <div className="flex flex-col items-center justify-center text-center">
                  <div
                    className={`w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl shadow-xs mb-3 ${
                      conversation.avatarBg || "bg-[#7D9D5B] text-white"
                    }`}
                  >
                    {conversation.avatarInitials || "LG"}
                  </div>
                  <h4 className="text-base font-bold text-gray-900 dark:text-white px-4 leading-tight">
                    {conversation.name}
                  </h4>
                  <div className="flex items-center justify-center gap-2 mt-1.5">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {membersList.length} Members
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                      {memberRoleTag}
                    </span>
                  </div>
                </div>

                {/* Section: CONVERSATION ACTIONS */}
                <div className="space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1">
                    Conversation actions
                  </div>

                  <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-150 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-850 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => showNotice("Marked as unread")}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-4 h-4 text-gray-500" />
                      <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
                        Mark as unread
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onStarToggle?.();
                        showNotice("Added to starred conversations");
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
                    >
                      <Star className="w-4 h-4 text-gray-500" />
                      <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
                        Star
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => showNotice("Conversation archived")}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
                    >
                      <Archive className="w-4 h-4 text-gray-500" />
                      <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
                        Archive
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onMuteToggle?.();
                        showNotice("Notifications muted for this group");
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
                    >
                      <VolumeX className="w-4 h-4 text-gray-500" />
                      <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200">
                        Mute this conversation
                      </span>
                    </button>
                  </div>
                </div>

                {/* Section: DANGER / CLEAR ACTIONS */}
                <div className="space-y-2 pt-1">
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-150 dark:border-gray-800 rounded-2xl overflow-hidden bg-white dark:bg-gray-850 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => {
                        onClearChat?.();
                        showNotice("Chat history cleared from device");
                      }}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-rose-500 dark:text-rose-400 transition-colors cursor-pointer"
                    >
                      <MinusCircle className="w-4 h-4" />
                      <span className="text-xs sm:text-sm font-medium">Clear chat</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => showNotice("Exited group")}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-rose-500 dark:text-rose-400 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-xs sm:text-sm font-medium">Exit group</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => showNotice("Conversation removed from inbox")}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-rose-50/50 dark:hover:bg-rose-950/20 text-rose-500 dark:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-xs sm:text-sm font-medium">Remove from inbox</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed px-1">
                    Clear chat removes messages on your devices. Exit group stops new messages; delete removes the chat from your inbox.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------- */}
          {/* TAB 2: MEMBERS (Matching Screenshot 3)               */}
          {/* ---------------------------------------------------- */}
          {activeTab === "members" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-5 pb-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Members</h3>
              </div>

              <div className="px-6 py-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  {membersList.length} Members
                </div>

                {/* Search Box */}
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={memberSearchQuery}
                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                    placeholder="Search members..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
                  />
                </div>
              </div>

              {/* Members List */}
              <div className="flex-1 overflow-y-auto px-6 divide-y divide-gray-100 dark:divide-gray-800/80">
                {filteredMembers.length === 0 ? (
                  <div className="py-12 text-center text-xs text-gray-400">
                    No members match your search
                  </div>
                ) : (
                  filteredMembers.map((m) => (
                    <div
                      key={m.id}
                      className="py-3 flex items-center justify-between gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 rounded-xl px-1 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${m.avatarBg}`}
                        >
                          {m.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {m.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                              {m.roleBadge}
                            </span>
                            <span className="text-[11px] text-gray-400 truncate">
                              {m.lastSeen}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------- */}
          {/* TAB 3: MEDIA (Matching Screenshot 4)                 */}
          {/* ---------------------------------------------------- */}
          {activeTab === "media" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-5 pb-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Media</h3>
              </div>

              {/* Sub-tab pills: Media | Docs */}
              <div className="px-6 pt-1 pb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMediaSubTab("media")}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    mediaSubTab === "media"
                      ? "bg-black text-white dark:bg-white dark:text-black shadow-2xs"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                  }`}
                >
                  Media
                </button>
                <button
                  type="button"
                  onClick={() => setMediaSubTab("docs")}
                  className={`px-3.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    mediaSubTab === "docs"
                      ? "bg-black text-white dark:bg-white dark:text-black shadow-2xs"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                  }`}
                >
                  Docs
                </button>
              </div>

              {/* Content area */}
              <div className="flex-1 overflow-y-auto px-6 pb-6">
                {mediaSubTab === "media" ? (
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      October 2026
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      {mediaItems.map((item) => (
                        <div
                          key={item.id}
                          className="aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-150 dark:border-gray-800 group relative cursor-pointer"
                        >
                          <img
                            src={item.url}
                            alt={item.name || "Media"}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    {docItems.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3 rounded-2xl border border-gray-150 dark:border-gray-800 bg-white dark:bg-gray-850 hover:bg-gray-50 dark:hover:bg-gray-800/40 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                              {doc.title}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {doc.size} • {doc.date}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---------------------------------------------------- */}
          {/* TAB 4: STARRED (Matching Screenshot 5)               */}
          {/* ---------------------------------------------------- */}
          {activeTab === "starred" && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 pt-5 pb-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Starred</h3>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center mb-3">
                  <Star className="w-6 h-6" />
                </div>
                <div className="text-sm font-medium text-gray-400 dark:text-gray-500">
                  No starred messages
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
