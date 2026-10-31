"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { store } from "@/lib/store";
import { createMessageId } from "@/lib/id";
import {
  ChatConversation,
  ChatMessage,
  ChatPoll,
  ChatUserSettings,
  PASTEL_AVATARS,
  getInitials,
} from "@/types/chat";
import {
  Search,
  Edit3,
  Settings as SettingsIcon,
  ArrowLeft,
  Paperclip,
  Plus,
  BarChart2,
  Image as ImageIcon,
  CheckCircle2,
  Circle,
  Smile,
  Send,
  Mic,
  MoreVertical,
  Shield,
  Compass,
  GraduationCap,
  BusFront,
  Ticket,
  Users,
  Check,
  CheckCheck,
  FileText,
  MapPin,
  MessageSquare,
  Sparkles,
  ChevronRight,
  ChevronDown,
  User,
  Bell,
  RefreshCw,
  X,
  Volume2,
  VolumeX,
  Trash2,
  Pencil,
} from "lucide-react";

const MENTION_ROLES = [
  { tag: "@transportadmin", role: "transport_admin", label: "Transport Admin", icon: Shield, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  { tag: "@transportmanager", role: "transport_manager", label: "Transport Manager", icon: Compass, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
  { tag: "@teacher", role: "teacher", label: "Class Faculty / Coordinator", icon: GraduationCap, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  { tag: "@driver", role: "driver", label: "Bus Driver", icon: BusFront, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800" },
  { tag: "@conductor", role: "conductor", label: "Bus Conductor", icon: Ticket, color: "text-pink-600 bg-pink-50 dark:bg-pink-950/60 dark:text-pink-300 border-pink-200 dark:border-pink-800" },
];

export function ChatPortalView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active view states
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [leftView, setLeftView] = useState<"messages" | "settings">("messages");
  const [filterTab, setFilterTab] = useState<"All" | "Buses" | "Classes" | "Campus" | "Unread" | "Staff">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Mention system
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  // Drawer & Popover states
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [activeSettingSection, setActiveSettingSection] = useState<string | null>(null);

  // Poll & Media state
  const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Message edit CRUD
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");

  // User info & settings
  const [currentUser, setCurrentUser] = useState<any>(() => store.getCurrentUser());
  const [userSettings, setUserSettings] = useState<ChatUserSettings | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isUserScrolledUpRef = useRef(false);
  const prevConvIdRef = useRef<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Dedicated container-only scroll: NEVER scrolls outer window or pushes headers off screen
  const scrollToBottom = (smooth = true) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const handleContainerScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // If user is more than 120px above the bottom, consider them reading older history
    const isUp = distanceFromBottom > 120;
    isUserScrolledUpRef.current = isUp;
    setShowScrollBottomBtn(isUp);
  };

  // Sync user state
  useEffect(() => {
    const unsub = store.subscribe(() => {
      setCurrentUser(store.getCurrentUser());
    });
    return unsub;
  }, []);

  // Fetch conversations and user settings on mount
  useEffect(() => {
    loadConversations();
    loadSettings();

    // Check query params for initial route
    const cid = searchParams.get("c");
    const view = searchParams.get("view");
    if (cid) setActiveConvId(cid);
    if (view === "settings") setLeftView("settings");
  }, [searchParams]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);

    // Set up light polling every 4 seconds for live chat
    const interval = setInterval(() => {
      loadMessages(activeConvId, true);
    }, 4000);

    return () => clearInterval(interval);
  }, [activeConvId]);

  // Safe scroll effect: jumps on conversation change, smooth scrolls only if user is at the bottom
  useEffect(() => {
    if (!activeConvId) return;

    if (prevConvIdRef.current !== activeConvId) {
      prevConvIdRef.current = activeConvId;
      isUserScrolledUpRef.current = false;
      setShowScrollBottomBtn(false);
      const timer = setTimeout(() => scrollToBottom(false), 60);
      return () => clearTimeout(timer);
    }

    if (!isUserScrolledUpRef.current) {
      const timer = setTimeout(() => scrollToBottom(true), 60);
      return () => clearTimeout(timer);
    }
  }, [messages, activeConvId]);

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      const data = await res.json();
      if (data.success && data.conversations) {
        setConversations(data.conversations);
        const queryC = searchParams.get("c");
        // If query param matches an active valid conversation
        if (queryC && data.conversations.some((c: any) => c.id === queryC)) {
          setActiveConvId(queryC);
        } else if (!activeConvId || !data.conversations.some((c: any) => c.id === activeConvId)) {
          // If unset or invalid (e.g. old corridor route), default to the first valid channel
          if (data.conversations.length > 0 && window.innerWidth >= 768) {
            setActiveConvId(data.conversations[0].id);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/chat/settings");
      const data = await res.json();
      if (data.success && data.settings) {
        setUserSettings(data.settings);
      }
    } catch (err) {
      console.error("Failed to load chat settings:", err);
    }
  };

  const loadMessages = async (convId: string, isPoll = false) => {
    if (!isPoll) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/messages?conversationId=${convId}`);
      const data = await res.json();
      if (data.success && data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      if (!isPoll) setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || !activeConvId) return;

    setInputMessage("");
    setIsMentionOpen(false);
    setIsTemplatesOpen(false);

    // Optimistic UI update using Enterprise TypeID
    const tempId = createMessageId();
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversationId: activeConvId,
      senderId: currentUser?.id || "usr_guest",
      senderName: currentUser?.fullName || currentUser?.email?.split("@")[0] || "Me",
      senderRole: currentUser?.role || "student",
      text: textToSend,
      createdAt: new Date().toISOString(),
      reactions: [],
    };
    isUserScrolledUpRef.current = false;
    setShowScrollBottomBtn(false);
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 40);

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          text: textToSend,
          senderId: currentUser?.id,
          senderName: currentUser?.fullName || currentUser?.email?.split("@")[0] || "Me",
          senderRole: currentUser?.role || "student",
        }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
        // Refresh conversations to update last message preview
        loadConversations();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleSendPoll = async (poll: ChatPoll) => {
    if (!activeConvId) return;

    const tempId = createMessageId();
    const optimisticMsg: ChatMessage = {
      id: tempId,
      conversationId: activeConvId,
      senderId: currentUser?.id || "usr_guest",
      senderName: currentUser?.fullName || currentUser?.email?.split("@")[0] || "Me",
      senderRole: currentUser?.role || "student",
      text: `📊 Poll: ${poll.question}`,
      poll,
      createdAt: new Date().toISOString(),
      reactions: [],
    };

    isUserScrolledUpRef.current = false;
    setShowScrollBottomBtn(false);
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 40);

    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvId,
          text: `📊 Poll: ${poll.question}`,
          poll,
          senderId: currentUser?.id,
          senderName: currentUser?.fullName || currentUser?.email?.split("@")[0] || "Me",
          senderRole: currentUser?.role || "student",
        }),
      });
      const data = await res.json();
      if (data.success && data.message) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
        loadConversations();
      }
    } catch (err) {
      console.error("Failed to send poll:", err);
    }
  };

  const handleCreatePoll = async () => {
    if (!pollQuestion.trim() || !activeConvId) return;
    const cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) return;

    const pollData: ChatPoll = {
      question: pollQuestion.trim(),
      options: cleanOptions.map((text, i) => ({
        id: `opt-${Date.now()}-${i}`,
        text,
        votes: 0,
        voterIds: [],
      })),
      allowMultiple: pollAllowMultiple,
      totalVotes: 0,
    };

    setIsCreatePollOpen(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollAllowMultiple(false);

    await handleSendPoll(pollData);
  };

  const handleVotePoll = async (messageId: string, optionId: string) => {
    const uid = currentUser?.id || "usr_guest";

    // 1. Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.poll) return m;
        const currentPoll = m.poll;
        const allowMultiple = Boolean(currentPoll.allowMultiple);

        const updatedOptions = currentPoll.options.map((opt) => {
          let voterIds = [...(opt.voterIds || [])];

          if (opt.id === optionId) {
            // Toggle
            if (voterIds.includes(uid)) {
              voterIds = voterIds.filter((id) => id !== uid);
            } else {
              voterIds.push(uid);
            }
          } else if (!allowMultiple) {
            // Single choice: remove user from any other option
            voterIds = voterIds.filter((id) => id !== uid);
          }

          return {
            ...opt,
            voterIds,
            votes: voterIds.length,
          };
        });

        // Recalculate unique total voters
        const uniqueVoters = new Set<string>();
        updatedOptions.forEach((o) => (o.voterIds || []).forEach((id) => uniqueVoters.add(id)));

        return {
          ...m,
          poll: {
            ...currentPoll,
            options: updatedOptions,
            totalVotes: uniqueVoters.size,
          },
        };
      })
    );

    // 2. Persist to MongoDB
    try {
      const res = await fetch("/api/chat/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, optionId, userId: uid }),
      });
      const data = await res.json();
      if (data.success && data.poll) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, poll: data.poll } : m))
        );
      }
    } catch (err) {
      console.error("Failed to vote in poll:", err);
    }
  };

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInputMessage((prev) => (prev ? `${prev} [Attachment: ${file.name}]` : `[Attachment: ${file.name}]`));
    e.target.value = "";
    inputRef.current?.focus();
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...(m.reactions || [])];
          const existIdx = reactions.findIndex((r) => r.emoji === emoji);
          const uid = currentUser?.id || "usr_guest";
          if (existIdx >= 0) {
            const r = { ...reactions[existIdx] };
            if (r.userIds.includes(uid)) {
              r.userIds = r.userIds.filter((id) => id !== uid);
              r.count = r.userIds.length;
              if (r.count === 0) reactions.splice(existIdx, 1);
              else reactions[existIdx] = r;
            } else {
              r.userIds = [...r.userIds, uid];
              r.count = r.userIds.length;
              reactions[existIdx] = r;
            }
          } else {
            reactions.push({ emoji, count: 1, userIds: [uid] });
          }
          return { ...m, reactions };
        })
      );

      await fetch("/api/chat/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji, userId: currentUser?.id }),
      });
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      await fetch(`/api/chat/messages?messageId=${msgId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  const handleSaveEditMessage = async (msgId: string) => {
    if (!editingMessageText.trim()) return;
    try {
      const newText = editingMessageText.trim();
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, text: newText, isEdited: true } : m))
      );
      setEditingMessageId(null);
      setEditingMessageText("");

      await fetch("/api/chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: msgId,
          text: newText,
          userId: currentUser?.id,
        }),
      });
    } catch (err) {
      console.error("Failed to edit message:", err);
    }
  };

  // Handle typing & mention triggers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputMessage(val);

    // Check if user is typing a mention
    const lastAtIdx = val.lastIndexOf("@");
    if (lastAtIdx !== -1 && lastAtIdx >= val.length - 20) {
      const query = val.substring(lastAtIdx + 1);
      if (!query.includes(" ")) {
        setIsMentionOpen(true);
        setMentionQuery(query.toLowerCase());
        return;
      }
    }
    setIsMentionOpen(false);
  };

  const insertMention = (tag: string) => {
    const lastAtIdx = inputMessage.lastIndexOf("@");
    if (lastAtIdx === -1) {
      setInputMessage((prev) => prev + tag + " ");
    } else {
      const before = inputMessage.substring(0, lastAtIdx);
      setInputMessage(before + tag + " ");
    }
    setIsMentionOpen(false);
    inputRef.current?.focus();
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.lastMessage?.text?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (filterTab === "Unread") return (c.unreadCount || 0) > 0;
    if (filterTab === "Buses") return c.category === "bus" || c.name.startsWith("Bus ") || c.id.startsWith("bus-");
    if (filterTab === "Classes") return c.category === "class" || c.id.startsWith("class-");
    if (filterTab === "Campus") return c.category === "campus" || (c.id.startsWith("campus-") && c.id !== "campusfleet-main");
    if (filterTab === "Staff") return c.type === "DIRECT" || c.name.toLowerCase().includes("conductor") || c.name.toLowerCase().includes("driver") || c.name.toLowerCase().includes("admin") || c.name.toLowerCase().includes("manager");
    return true;
  });

  const activeConversation = conversations.find((c) => c.id === activeConvId);

  // Format message text with highlighted @mentions
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("@")) {
        const raw = part.toLowerCase();
        const roleMatch = MENTION_ROLES.find((r) => r.tag === raw);
        if (roleMatch) {
          return (
            <span
              key={idx}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold border ${roleMatch.color} mx-0.5`}
            >
              <roleMatch.icon className="w-3 h-3" />
              <span>{roleMatch.tag}</span>
            </span>
          );
        }
        return (
          <span
            key={idx}
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 mx-0.5"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // Format timestamp (e.g. "17:34")
  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    } catch {
      return "";
    }
  };

  // Format date header (e.g. "Thursday", "Today", "13 Oct")
  const formatDateHeader = (isoString?: string) => {
    if (!isoString) return "Today";
    try {
      const d = new Date(isoString);
      const today = new Date();
      if (d.toDateString() === today.toDateString()) return "Today";
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
      return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    } catch {
      return "Today";
    }
  };

  const getAvatarColor = (name: string, index: number) => {
    return PASTEL_AVATARS[index % PASTEL_AVATARS.length];
  };

  return (
    <div className="flex-1 min-h-0 flex w-full h-full bg-white dark:bg-gray-900 border-x border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
      
      {/* ======================================================== */}
      {/* LEFT COLUMN: Sidebar (Messages / Settings / New Chat)   */}
      {/* ======================================================== */}
      <div
        className={`w-full md:w-[380px] lg:w-[420px] flex-shrink-0 border-r border-gray-200 dark:border-gray-800 flex flex-col h-full min-h-0 bg-white dark:bg-gray-900 transition-all ${
          activeConvId ? "hidden md:flex" : "flex"
        }`}
      >
        {/* --- VIEW 1: MESSAGES (Default) --- */}
        {leftView === "messages" && (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                Messages
              </h1>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSearchQuery("")}
                  className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Search messages"
                >
                  <Search className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setLeftView("settings")}
                  className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Chat settings"
                >
                  <SettingsIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search Pill */}
            <div className="px-4 py-3">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search channels and messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm rounded-full bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-transparent transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Pills */}
            <div className="px-4 pb-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-gray-800">
              {(["All", "Buses", "Classes", "Campus", "Unread", "Staff"] as const).map((tab) => {
                const isActive = filterTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setFilterTab(tab)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
                      isActive
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-xs"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/50">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400 space-y-1">
                  <p className="font-medium text-gray-600 dark:text-gray-300">No channels found</p>
                  <p className="text-xs text-gray-400">
                    {searchQuery ? "Try searching with a different term" : "Your assigned transit channels will appear here"}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv, idx) => {
                  const isSelected = conv.id === activeConvId;
                  const initials = conv.avatarInitials || getInitials(conv.name);
                  const avatarClasses = getAvatarColor(conv.name, idx);

                  return (
                    <div
                      key={conv.id}
                      onClick={() => {
                        setActiveConvId(conv.id);
                        router.push(`/chat?c=${conv.id}`, { scroll: false });
                      }}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-gray-100/90 dark:bg-gray-800/70"
                          : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      }`}
                    >
                      {/* Pastel Circular Avatar */}
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${avatarClasses}`}
                      >
                        {initials}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                              {conv.name}
                            </h3>
                            {conv.category === "bus" || conv.name.startsWith("Bus ") ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex-shrink-0">
                                Bus
                              </span>
                            ) : conv.category === "class" || conv.id.startsWith("class-") ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex-shrink-0">
                                Class
                              </span>
                            ) : conv.category === "campus" || conv.id.startsWith("campus-") ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex-shrink-0">
                                Campus
                              </span>
                            ) : conv.id === "campusfleet-main" ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex-shrink-0">
                                Main
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap flex-shrink-0">
                            {formatTime(conv.lastMessage?.createdAt) || "Recent"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {conv.lastMessage?.senderName && (
                              <span className="font-semibold text-gray-700 dark:text-gray-300 mr-1">
                                {conv.lastMessage.senderName}:
                              </span>
                            )}
                            {conv.lastMessage?.text || "No messages yet"}
                          </p>
                          {(conv.unreadCount || 0) > 0 && (
                            <span className="w-4 h-4 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* --- VIEW 2: SETTINGS (Reverse-Engineered Screenshot 2) --- */}
        {leftView === "settings" && (
          <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-900">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <button
                onClick={() => setLeftView("messages")}
                className="p-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Chat settings</h2>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              {/* User Profile Card */}
              <div className="p-4 rounded-2xl border border-gray-200 dark:border-gray-800 flex items-center gap-4 bg-gray-50/50 dark:bg-gray-800/30">
                <div className="w-14 h-14 rounded-full bg-amber-200 text-amber-900 font-bold text-lg flex items-center justify-center flex-shrink-0">
                  {getInitials(currentUser?.fullName || "Aditya Pandey")}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-gray-900 dark:text-white truncate">
                    {currentUser?.fullName || "Aditya Pandey"}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {userSettings?.about || "Hey there! I am using CampusFleet Chat."}
                  </p>
                </div>
              </div>

              {/* Menu Items */}
              <div className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setActiveSettingSection("profile")}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-500" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Profile</div>
                      <div className="text-xs text-gray-400">Name and about</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                <button
                  onClick={() => setActiveSettingSection("notifications")}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-gray-500" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Notifications & privacy</div>
                      <div className="text-xs text-gray-400">Alerts and notification sounds</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                <button
                  onClick={() => setActiveSettingSection("templates")}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-gray-500" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Message templates</div>
                      <div className="text-xs text-gray-400">Personal quick replies</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-gray-500" />
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">Refresh app</div>
                      <div className="text-xs text-gray-400">Hard reload in browser or PWA</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Sub-setting drawer if active */}
              {activeSettingSection === "templates" && (
                <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                    Quick Reply Templates
                  </h4>
                  <ul className="text-xs space-y-1 text-gray-700 dark:text-gray-300">
                    {(userSettings?.quickReplies || []).map((q, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span>•</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* RIGHT COLUMN: Chat Viewport / Active Thread              */}
      {/* ======================================================== */}
      <div
        className={`flex-1 min-h-0 flex flex-col h-full bg-white dark:bg-gray-900 relative ${
          activeConvId ? "flex" : "hidden md:flex"
        }`}
      >
        {activeConversation ? (
          <>
            {/* Conversation Header (Matching Screenshot 5) */}
            <div className="h-16 flex-shrink-0 px-4 sm:px-6 border-b border-gray-200/80 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 z-10">
              <div className="flex items-center gap-3 min-w-0">
                {/* Mobile Back Button */}
                <button
                  onClick={() => setActiveConvId(null)}
                  className="md:hidden p-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${getAvatarColor(
                    activeConversation.name,
                    0
                  )}`}
                >
                  {activeConversation.avatarInitials || getInitials(activeConversation.name)}
                </div>

                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
                    {activeConversation.name}
                  </h2>
                  <button
                    onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                    className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline block text-left"
                  >
                    details
                  </button>
                </div>
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                  className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title="Group Details & Members"
                >
                  <Users className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                  className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Slide-over Group Details Drawer */}
            {isDetailsOpen && (
              <div className="absolute top-16 right-0 w-80 h-[calc(100%-64px)] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-xl z-20 flex flex-col p-4 animate-in slide-in-from-right duration-200">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">Group Information</h3>
                  <button onClick={() => setIsDetailsOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="py-4 space-y-4 flex-1 overflow-y-auto">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-blue-600 text-white font-black text-xl flex items-center justify-center mx-auto mb-2">
                      {activeConversation.avatarInitials}
                    </div>
                    <h4 className="font-bold text-sm text-gray-900 dark:text-white">{activeConversation.name}</h4>
                    <p className="text-xs text-gray-400 mt-1">{activeConversation.description || "CampusFleet transit communication channel"}</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
                      <Sparkles className="w-3 h-3" />
                      <span>Automated Dynamic Channel</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Enrolled Members</div>
                    <p className="text-xs text-gray-500">
                      {activeConversation.isAutoAssigned
                        ? "All registered students, faculty, and route crew are automatically synchronized with this channel."
                        : `${activeConversation.memberIds.length} members enrolled.`}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Mention Guide</div>
                    <div className="text-xs space-y-1.5 text-gray-600 dark:text-gray-300">
                      <div className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-blue-500" /> <code>@transportadmin</code> — Alert Admin Desk</div>
                      <div className="flex items-center gap-1.5"><Compass className="w-3.5 h-3.5 text-amber-500" /> <code>@transportmanager</code> — Alert Fleet Manager</div>
                      <div className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5 text-emerald-500" /> <code>@teacher</code> — Alert Faculty</div>
                      <div className="flex items-center gap-1.5"><BusFront className="w-3.5 h-3.5 text-indigo-500" /> <code>@driver</code> — Alert Route Bus Driver</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Message Thread (Matching Screenshot 5) */}
            <div
              ref={messagesContainerRef}
              onScroll={handleContainerScroll}
              className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gray-50/40 dark:bg-gray-900/40 overscroll-contain"
            >
              {/* Day divider */}
              <div className="flex items-center justify-center my-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold text-gray-500 bg-gray-200/60 dark:bg-gray-800 shadow-2xs">
                  {formatDateHeader(messages[0]?.createdAt)}
                </span>
              </div>

              {messages.map((msg, index) => {
                const isMe = msg.senderId === currentUser?.id || msg.senderRole === "student" && msg.senderName === currentUser?.fullName;

                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col group ${isMe ? "items-end" : "items-start"}`}
                  >
                    {/* Sender Name above message (gray text, matching Screenshot 5) */}
                    {!isMe && (
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 ml-1">
                        {msg.senderName}
                      </span>
                    )}

                    {/* Chat Bubble */}
                    {editingMessageId === msg.id ? (
                      <div className="p-2.5 rounded-2xl bg-white dark:bg-gray-800 border border-blue-500 shadow-md max-w-[85%] sm:max-w-[75%] space-y-2">
                        <textarea
                          rows={2}
                          value={editingMessageText}
                          onChange={(e) => setEditingMessageText(e.target.value)}
                          className="w-full text-xs p-1.5 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none"
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingMessageId(null)}
                            className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEditMessage(msg.id)}
                            className="px-2.5 py-0.5 bg-blue-600 text-white rounded text-xs font-semibold"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : msg.poll ? (
                      /* Interactive Poll Card (Matching Haveloc & modern chat standards) */
                      <div
                        className={`w-full max-w-sm sm:max-w-md rounded-2xl p-4 shadow-sm border space-y-3 ${
                          isMe
                            ? "bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-900/60"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        }`}
                      >
                        {/* Poll Header */}
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                            <BarChart2 className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-gray-900 dark:text-white leading-snug">
                              {msg.poll.question}
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                              <span>{msg.poll.allowMultiple ? "Select one or more" : "Select one"}</span>
                              <span>•</span>
                              <span>
                                {msg.poll.totalVotes} {msg.poll.totalVotes === 1 ? "vote" : "votes"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Poll Options */}
                        <div className="space-y-2">
                          {msg.poll.options.map((opt) => {
                            const isVoted = opt.voterIds?.includes(currentUser?.id || "usr_guest");
                            const percent =
                              msg.poll!.totalVotes > 0
                                ? Math.round((opt.votes / msg.poll!.totalVotes) * 100)
                                : 0;

                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleVotePoll(msg.id, opt.id)}
                                className={`relative w-full text-left p-3 rounded-xl border transition-all overflow-hidden group cursor-pointer ${
                                  isVoted
                                    ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 shadow-2xs"
                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50/50 dark:bg-gray-850"
                                }`}
                              >
                                {/* Animated Progress Fill */}
                                <div
                                  className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-xl ${
                                    isVoted
                                      ? "bg-blue-200/50 dark:bg-blue-900/40"
                                      : "bg-gray-200/50 dark:bg-gray-700/50"
                                  }`}
                                  style={{ width: `${percent}%` }}
                                />

                                {/* Foreground Content */}
                                <div className="relative z-1 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {isVoted ? (
                                      <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                                    ) : (
                                      <Circle className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 shrink-0" />
                                    )}
                                    <span
                                      className={`text-xs font-semibold truncate ${
                                        isVoted
                                          ? "text-blue-900 dark:text-blue-100 font-bold"
                                          : "text-gray-800 dark:text-gray-200"
                                      }`}
                                    >
                                      {opt.text}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 text-xs font-semibold">
                                    <span
                                      className={
                                        isVoted
                                          ? "text-blue-700 dark:text-blue-300"
                                          : "text-gray-500 dark:text-gray-400"
                                      }
                                    >
                                      {percent}%
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-normal">
                                      ({opt.votes})
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Poll Footer */}
                        <div className="flex items-center justify-between pt-1 text-[10px] text-gray-400 border-t border-gray-100 dark:border-gray-700/60">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live poll
                          </span>
                          <span>{formatTime(msg.createdAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`relative px-4 py-2.5 rounded-2xl max-w-[85%] sm:max-w-[75%] shadow-2xs text-sm leading-relaxed ${
                          isMe
                            ? "bg-blue-600 text-white rounded-tr-xs"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-xs"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {renderFormattedText(msg.text)}
                          {msg.isEdited && (
                            <span className={`text-[10px] ml-1.5 opacity-70 ${isMe ? "text-blue-200" : "text-gray-400"}`}>
                              (edited)
                            </span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div
                          className={`text-[10px] mt-1 text-right font-medium ${
                            isMe ? "text-blue-100" : "text-gray-400"
                          }`}
                        >
                          {formatTime(msg.createdAt)}
                        </div>
                      </div>
                    )}

                    {/* Emoji Reactions below bubble */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 ml-1">
                        {msg.reactions.map((r, ri) => (
                          <button
                            key={ri}
                            onClick={() => handleReaction(msg.id, r.emoji)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xs hover:scale-105 transition-transform"
                          >
                            <span>{r.emoji}</span>
                            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
                              {r.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Hover quick reaction & CRUD buttons */}
                    <div className="hidden group-hover:flex items-center gap-1 mt-0.5 opacity-90">
                      {(["👍", "❤️", "🚌"].map((e) => (
                        <button
                          key={e}
                          onClick={() => handleReaction(msg.id, e)}
                          className="text-xs p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                        >
                          {e}
                        </button>
                      )))}
                      {isMe && (
                        <>
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingMessageText(msg.text);
                            }}
                            title="Edit message"
                            className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteMessage(msg.id)}
                            title="Delete message"
                            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="h-2 w-full" />
            </div>

            {/* Mention Suggestions Popover (Opens above input when typing @) */}
            {isMentionOpen && (
              <div className="absolute bottom-20 left-4 sm:left-6 z-30 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  Mention Role or Crew
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
                  {MENTION_ROLES.filter((r) => r.tag.toLowerCase().includes(mentionQuery)).map((role) => (
                    <button
                      key={role.tag}
                      onClick={() => insertMention(role.tag)}
                      className="w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors"
                    >
                      <div className={`p-1.5 rounded-lg border ${role.color}`}>
                        <role.icon className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900 dark:text-white">{role.tag}</div>
                        <div className="text-[10px] text-gray-400">{role.label}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Templates Drawer */}
            {isTemplatesOpen && (
              <div className="absolute bottom-20 right-4 sm:right-6 z-30 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-3 space-y-2">
                <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-xs font-bold text-gray-900 dark:text-white">Quick Reply Templates</span>
                  <button onClick={() => setIsTemplatesOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(userSettings?.quickReplies || []).map((template, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(template)}
                      className="w-full text-left p-2 rounded-lg text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 transition-colors"
                    >
                      {template}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Floating Jump to Bottom Button */}
            {showScrollBottomBtn && (
              <button
                type="button"
                onClick={() => {
                  isUserScrolledUpRef.current = false;
                  setShowScrollBottomBtn(false);
                  scrollToBottom(true);
                }}
                className="absolute bottom-20 right-6 z-20 p-2.5 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all flex items-center justify-center animate-in fade-in zoom-in duration-150"
                title="Jump to latest message"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            )}

            {/* Attachment Menu Popup (Matching Haveloc Screenshot) */}
            {isAttachmentOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setIsAttachmentOpen(false)}
                />
                <div className="absolute bottom-20 left-4 sm:left-6 z-30 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                  {/* Media */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachmentOpen(false);
                      fileInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors group cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/80 flex items-center justify-center text-gray-600 dark:text-gray-300 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/60 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-white">Media</div>
                      <div className="text-[11px] text-gray-400">Photos, files & more</div>
                    </div>
                  </button>

                  {/* Poll */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachmentOpen(false);
                      setIsCreatePollOpen(true);
                    }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors group cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700/80 flex items-center justify-center text-gray-600 dark:text-gray-300 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/60 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      <BarChart2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-white">Poll</div>
                      <div className="text-[11px] text-gray-400">Ask the group</div>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* Hidden file input for Media */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              className="hidden"
              onChange={handleMediaSelect}
            />

            {/* Bottom Input Toolbar: Always fixed at bottom */}
            <div className="flex-shrink-0 p-3 sm:p-4 bg-white dark:bg-gray-900 border-t border-gray-200/80 dark:border-gray-800 z-10 sticky bottom-0">
              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/80 rounded-full px-3 py-1.5 border border-transparent focus-within:border-gray-300 dark:focus-within:border-gray-700 transition-all">
                {/* + Attachment button */}
                <button
                  type="button"
                  onClick={() => setIsAttachmentOpen(!isAttachmentOpen)}
                  className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors flex-shrink-0 cursor-pointer"
                  title="Add attachment or poll"
                >
                  <Plus className={`w-4 h-4 transition-transform duration-200 ${isAttachmentOpen ? "rotate-45" : ""}`} />
                </button>

                {/* Emoji button */}
                <button
                  type="button"
                  onClick={() => insertMention("@transportadmin")}
                  className="p-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full transition-colors flex-shrink-0 cursor-pointer"
                  title="Mention Transport Admin"
                >
                  <Smile className="w-4 h-4" />
                </button>

                {/* Text input */}
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type a message (type @ to alert roles)"
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none min-w-0"
                />

                {/* Quick Templates Icon */}
                <button
                  type="button"
                  onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full transition-colors flex-shrink-0 cursor-pointer"
                  title="Quick templates"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>

                {/* Send Button */}
                {inputMessage.trim() ? (
                  <button
                    type="button"
                    onClick={() => handleSendMessage()}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xs transition-transform active:scale-95 flex-shrink-0 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendMessage("👋 Check-in")}
                    className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full transition-colors flex-shrink-0 cursor-pointer"
                    title="Send quick wave"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Empty Selection State (Matching Screenshot 1 & 4) */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 mb-4 shadow-2xs">
              <MessageSquare className="w-8 h-8 stroke-1" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              Select a conversation
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
              Choose a chat from the list to start messaging with students, faculty, or transport managers.
            </p>
          </div>
        )}
      </div>

      {/* Create Poll Modal  */}
      {isCreatePollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Create a Poll</h3>
                  <p className="text-[11px] text-gray-400">Ask the group and gather real-time feedback</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatePollOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Question */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  Question
                </label>
                <input
                  type="text"
                  placeholder="Ask a question..."
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Options */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  Options
                </label>
                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Option ${idx + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                        className="flex-1 px-3.5 py-2 rounded-xl text-xs sm:text-sm border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPollOptions(pollOptions.filter((_, i) => i !== idx));
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {pollOptions.length < 8 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ""])}
                    className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Option</span>
                  </button>
                )}
              </div>

              {/* Settings Toggle: Allow multiple answers */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-gray-900 dark:text-white">Allow multiple answers</div>
                  <div className="text-[11px] text-gray-400">Members can select more than one option</div>
                </div>
                <input
                  type="checkbox"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreatePollOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                onClick={handleCreatePoll}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Create Poll</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
