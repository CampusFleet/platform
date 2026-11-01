"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { store } from "@/lib/store";
import { createMessageId } from "@/lib/id";
import {
  ChatConversation,
  ChatMessage,
  ChatPoll,
  ChatTemplate,
  ChatUserSettings,
  PASTEL_AVATARS,
  getInitials,
} from "@/types/chat";
import { playNotificationTone } from "@/lib/chat-audio";
import {
  ChatSettingsMainView,
  SettingsSection,
  ProfileSettingsView,
  NotificationsSettingsView,
  MessageTemplatesView,
} from "./settings";
import { GroupDetailsModal } from "./GroupDetailsModal";
import { MessageActionsMenu } from "./MessageActionsMenu";
import { useTheme } from "@/components/common/ThemeProvider";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
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
  ThumbsUp,
  Heart,
  LayoutGrid,
  Sun,
  Moon,
  CornerUpLeft,
  Star,
  Pin,
} from "lucide-react";

const QUICK_REACTIONS = [
  { id: "like", emoji: "👍", label: "Thumbs Up", icon: ThumbsUp, color: "text-amber-500 hover:text-amber-600" },
  { id: "heart", emoji: "❤️", label: "Heart", icon: Heart, color: "text-rose-500 hover:text-rose-600 fill-rose-500" },
  { id: "bus", emoji: "🚌", label: "Bus", icon: BusFront, color: "text-blue-500 hover:text-blue-600" },
];

function renderReactionBadgeIcon(emoji: string) {
  if (emoji === "👍") return <ThumbsUp className="w-3 h-3 text-amber-500 shrink-0" />;
  if (emoji === "❤️") return <Heart className="w-3 h-3 text-rose-500 fill-rose-500 shrink-0" />;
  if (emoji === "🚌") return <BusFront className="w-3 h-3 text-blue-500 shrink-0" />;
  return <span className="text-xs">{emoji}</span>;
}

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
  const { theme, setTheme } = useTheme();

  // Active view states
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [leftView, setLeftView] = useState<"messages" | "settings">("messages");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "favorites" | "groups">("all");
  const [inputMessage, setInputMessage] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);

  // Replying & Context Menu states
  const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; text: string } | null>(null);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);

  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState("");

  // Mention system
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  // Drawer & Popover states
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [activeSettingSection, setActiveSettingSection] = useState<SettingsSection | null>("main");

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
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
    if (view === "settings") {
      setLeftView("settings");
      setActiveSettingSection("main");
    }
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
    } finally {
      setLoadingConversations(false);
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

  const handleUpdateSettings = async (updates: Partial<ChatUserSettings>): Promise<boolean> => {
    setUserSettings((prev) => (prev ? { ...prev, ...updates } : (updates as ChatUserSettings)));
    try {
      const res = await fetch("/api/chat/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error("Failed to update chat settings:", err);
      return false;
    }
  };

  const handleSaveProfile = async (updates: { about: string }) => {
    await handleUpdateSettings(updates);
  };

  const handleAddTemplate = async (newTpl: Omit<ChatTemplate, "id" | "createdAt">) => {
    const templateItem: ChatTemplate = {
      ...newTpl,
      id: `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    const updatedTemplates = [...(userSettings?.templates || []), templateItem];
    await handleUpdateSettings({ templates: updatedTemplates });
  };

  const handleDeleteTemplate = async (templateId: string) => {
    const updatedTemplates = (userSettings?.templates || []).filter((t) => t.id !== templateId);
    await handleUpdateSettings({ templates: updatedTemplates });
  };

  const loadMessages = async (convId: string, isPoll = false) => {
    if (!isPoll) setLoadingMessages(true);
    try {
      const res = await fetch(`/api/chat/messages?conversationId=${convId}`);
      const data = await res.json();
      if (data.success && data.messages) {
        const newMsgs: ChatMessage[] = data.messages;
        if (isPoll && newMsgs.length > 0 && messagesRef.current.length > 0) {
          const prevLastId = messagesRef.current[messagesRef.current.length - 1]?.id;
          const newLastMsg = newMsgs[newMsgs.length - 1];
          if (newLastMsg && newLastMsg.id !== prevLastId && newLastMsg.senderId !== currentUser?.id) {
            // Sound notification
            if (userSettings?.soundEnabled !== false) {
              const tone = userSettings?.notificationTone || userSettings?.notifications?.tone || "Classic";
              playNotificationTone(tone);
            }
            // Desktop push notification if enabled
            if (
              userSettings?.notificationsEnabled &&
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted" &&
              document.visibilityState !== "visible"
            ) {
              new Notification(newLastMsg.senderName || "CampusFleet Chat", {
                body: newLastMsg.text || "New message received",
                icon: "/favicon.ico",
              });
            }
          }
        }
        setMessages(newMsgs);
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

    const currentReply = replyingTo;
    setInputMessage("");
    setReplyingTo(null);
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
      replyTo: currentReply ? currentReply : undefined,
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
          replyTo: currentReply ? currentReply : undefined,
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

  // Filter conversations matching search query and active tab filter
  const filteredConversations = conversations.filter((c) => {
    // Tab filter
    if (activeFilter === "unread" && (c.unreadCount || 0) <= 0) return false;
    if (activeFilter === "favorites" && !(userSettings?.favorites || []).includes(c.id)) return false;
    if (activeFilter === "groups" && c.type !== "GROUP" && c.category === "direct") return false;

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      Boolean(c.description && c.description.toLowerCase().includes(q)) ||
      Boolean(c.lastMessage?.text && c.lastMessage.text.toLowerCase().includes(q))
    );
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
    <div className="flex-1 min-h-0 flex flex-col w-full h-full bg-white dark:bg-gray-900 border-x border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden relative">


      {/* Main Two-Column Viewport */}
      <div className="flex-1 min-h-0 flex w-full h-full overflow-hidden">
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
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    title="Search messages"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      setLeftView("settings");
                      setActiveSettingSection("main");
                    }}
                    className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    title="Chat settings"
                  >
                    <SettingsIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Search Pill */}
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
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
                      className="absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Pills: All | Unread | Favorites | Groups */}
              <div className="px-4 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-gray-100 dark:border-gray-800">
                {(["all", "unread", "favorites", "groups"] as const).map((filter) => {
                  const isActive = activeFilter === filter;
                  const label = filter.charAt(0).toUpperCase() + filter.slice(1);
                  const unreadTotal = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        isActive
                          ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-2xs"
                          : "bg-gray-100 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700/70"
                      }`}
                    >
                      <span>{label}</span>
                      {filter === "unread" && unreadTotal > 0 && (
                        <span className={`ml-1.5 px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                          isActive
                            ? "bg-white/20 text-white dark:bg-black/20 dark:text-gray-900"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300"
                        }`}>
                          {unreadTotal}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800/50 pb-16 md:pb-0">
              {loadingConversations ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-2xl animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between items-center">
                          <div className="h-3.5 bg-gray-200 dark:bg-gray-800 rounded-md w-3/5" />
                          <div className="h-2.5 bg-gray-100 dark:bg-gray-800/60 rounded-md w-10" />
                        </div>
                        <div className="h-2.5 bg-gray-100 dark:bg-gray-800/60 rounded-md w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations.length === 0 ? (
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
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-1">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate" title={conv.name}>
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
                          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap flex-shrink-0 ml-1">
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

            {/* Common CampusFleet Mobile Bottom Navigation */}
            <MobileBottomNav
              unreadCount={conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)}
              onOpenSettings={() => {
                setLeftView("settings");
                setActiveSettingSection("main");
              }}
            />
          </>
        )}

        {/* --- VIEW 2: SETTINGS (Modular Sub-Views) --- */}
        {leftView === "settings" && (
          <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
            {(!activeSettingSection || activeSettingSection === "main") && (
              <ChatSettingsMainView
                fullName={currentUser?.fullName || currentUser?.email?.split("@")[0] || "Aditya Pandey"}
                about={userSettings?.about || "Hey there! I am using CampusFleet Chat."}
                onSelectSection={(sec) => setActiveSettingSection(sec)}
                onBack={() => setLeftView("messages")}
              />
            )}

            {activeSettingSection === "profile" && (
              <ProfileSettingsView
                fullName={currentUser?.fullName || currentUser?.email?.split("@")[0] || "Aditya Pandey"}
                about={userSettings?.about || "Hey there! I am using CampusFleet Chat."}
                onSave={handleSaveProfile}
                onBack={() => setActiveSettingSection("main")}
              />
            )}

            {activeSettingSection === "notifications" && (
              <NotificationsSettingsView
                settings={
                  userSettings || {
                    userId: currentUser?.id || "usr_guest",
                    fullName: currentUser?.fullName || "Aditya Pandey",
                    soundEnabled: true,
                    notificationsEnabled: false,
                    notificationTone: "Classic",
                    notifications: { sound: true, mentionsOnly: false, desktop: false, tone: "Classic" },
                    quickReplies: [],
                    favorites: [],
                  }
                }
                onUpdate={handleUpdateSettings}
                onBack={() => setActiveSettingSection("main")}
              />
            )}

            {activeSettingSection === "templates" && (
              <MessageTemplatesView
                templates={userSettings?.templates || []}
                onAddTemplate={handleAddTemplate}
                onDeleteTemplate={handleDeleteTemplate}
                onBack={() => setActiveSettingSection("main")}
              />
            )}
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
            {/* Conversation Header: strictly sticky top-0, matching Image 1 & Image 2 */}
            <div className="sticky top-0 z-20 flex-shrink-0 h-14 sm:h-16 px-3 sm:px-6 border-b border-gray-200/80 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {/* Mobile Back Button: <- arrow */}
                <button
                  onClick={() => {
                    setActiveConvId(null);
                    router.push("/chat", { scroll: false });
                  }}
                  className="md:hidden p-1.5 -ml-1 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0 cursor-pointer"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div
                  onClick={() => setIsDetailsOpen(true)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 cursor-pointer ${getAvatarColor(
                    activeConversation.name,
                    0
                  )}`}
                >
                  {activeConversation.avatarInitials || getInitials(activeConversation.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <h2
                    onClick={() => setIsDetailsOpen(true)}
                    className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate leading-tight cursor-pointer"
                    title={activeConversation.name}
                  >
                    {activeConversation.name}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsDetailsOpen(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline block text-left cursor-pointer"
                  >
                    details
                  </button>
                </div>
              </div>

              {/* Header Actions: Search & More vertical dots (matching Image 1) */}
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setInChatSearchOpen(!inChatSearchOpen)}
                  className={`p-2 rounded-full transition-colors cursor-pointer ${
                    inChatSearchOpen
                      ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400"
                      : "text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                  title="Search in conversation"
                >
                  <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDetailsOpen(true)}
                  className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  title="Conversation info & options"
                >
                  <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            {/* In-Chat Search Bar */}
            {inChatSearchOpen && (
              <div className="sticky top-14 sm:top-16 z-20 flex-shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-850 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 animate-in slide-in-from-top-2 duration-150">
                <Search className="w-4 h-4 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search in this conversation..."
                  value={inChatSearchQuery}
                  onChange={(e) => setInChatSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                  autoFocus
                />
                {inChatSearchQuery && (
                  <button
                    onClick={() => setInChatSearchQuery("")}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setInChatSearchOpen(false);
                    setInChatSearchQuery("");
                  }}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline px-1 cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}

            {/* CampusFleet Group Details Modal */}
            {isDetailsOpen && activeConversation && (
              <GroupDetailsModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                conversation={activeConversation}
                messages={messages || []}
                currentUserRole={currentUser?.role}
                onClearChat={() => setMessages([])}
              />
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
                      /* Interactive Poll Card (CampusFleet live transit poll) */
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
                        {/* Replied message quote banner inside bubble */}
                        {msg.replyTo && (
                          <div
                            className={`mb-2 p-2 rounded-xl border-l-4 text-xs ${
                              isMe
                                ? "bg-blue-700/60 border-white text-white/90"
                                : "bg-gray-200/70 dark:bg-gray-700/60 border-blue-500 text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            <div className="font-bold text-[11px] opacity-90 truncate">
                              {msg.replyTo.senderName}
                            </div>
                            <div className="text-[11px] opacity-80 truncate line-clamp-1">
                              {msg.replyTo.text}
                            </div>
                          </div>
                        )}

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

                    {/* SVG Reactions below bubble */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 ml-1">
                        {msg.reactions.map((r, ri) => (
                          <button
                            key={ri}
                            onClick={() => handleReaction(msg.id, r.emoji)}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xs hover:scale-105 transition-transform cursor-pointer"
                          >
                            {renderReactionBadgeIcon(r.emoji)}
                            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
                              {r.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Hover quick reaction, menu trigger & CRUD buttons */}
                    <div className={`relative flex items-center gap-1 mt-0.5 ${activeMessageMenuId === msg.id ? "opacity-100 z-30" : "opacity-90"}`}>
                      <div className={`${activeMessageMenuId === msg.id ? "flex" : "hidden group-hover:flex"} items-center gap-1`}>
                        {QUICK_REACTIONS.map((qr) => {
                          const Icon = qr.icon;
                          return (
                            <button
                              key={qr.id}
                              onClick={() => handleReaction(msg.id, qr.emoji)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                              title={qr.label}
                            >
                              <Icon className={`w-3.5 h-3.5 ${qr.color}`} />
                            </button>
                          );
                        })}
                      </div>

                      {/* Menu trigger button & anchored popup */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setActiveMessageMenuId(activeMessageMenuId === msg.id ? null : msg.id)}
                          className={`${
                            activeMessageMenuId === msg.id
                              ? "opacity-100 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                              : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          } p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-800 transition-all cursor-pointer`}
                          title="More options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Floating MessageActionsMenu anchored directly to trigger button */}
                        <MessageActionsMenu
                          isOpen={activeMessageMenuId === msg.id}
                          onClose={() => setActiveMessageMenuId(null)}
                          onReact={(emoji) => {
                            handleReaction(msg.id, emoji);
                            setActiveMessageMenuId(null);
                          }}
                          onReply={() => {
                            setReplyingTo({
                              id: msg.id,
                              senderName: msg.senderName,
                              text: msg.text,
                            });
                            setActiveMessageMenuId(null);
                            inputRef.current?.focus();
                          }}
                          onCopy={() => {
                            navigator.clipboard.writeText(msg.text);
                            setActiveMessageMenuId(null);
                          }}
                          onDelete={() => {
                            handleDeleteMessage(msg.id);
                            setActiveMessageMenuId(null);
                          }}
                          isMe={Boolean(isMe)}
                        />
                      </div>

                      {isMe && (
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingMessageText(msg.text);
                            }}
                            title="Edit message"
                            className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
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
              <div className="absolute bottom-20 right-4 sm:right-6 z-30 w-80 bg-white dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-2xl shadow-xl p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between pb-1.5 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">Quick Templates</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsTemplatesOpen(false);
                        setLeftView("settings");
                        setActiveSettingSection("templates");
                      }}
                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                    >
                      Manage
                    </button>
                  </div>
                  <button
                    onClick={() => setIsTemplatesOpen(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {/* User custom templates */}
                  {(userSettings?.templates || []).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSendMessage(t.message)}
                      className="w-full text-left p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="text-xs font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {t.title}
                        </span>
                        {t.useIn && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                            {t.useIn}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1 leading-snug">
                        {t.message}
                      </p>
                    </button>
                  ))}

                  {/* Standard quick replies */}
                  {(userSettings?.quickReplies || []).map((template, idx) => (
                    <button
                      key={`qr_${idx}`}
                      onClick={() => handleSendMessage(template)}
                      className="w-full text-left p-2 rounded-xl text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
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

            {/* Attachment Menu Popup */}
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
            <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-t border-gray-200/80 dark:border-gray-800 z-10 sticky bottom-0">
              {/* Replying quote banner */}
              {replyingTo && (
                <div className="flex items-center justify-between px-4 py-2 bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/40 animate-in slide-in-from-bottom-2 duration-150">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="w-1 h-8 rounded-full bg-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 block truncate">
                        Replying to {replyingTo.senderName}
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-300 line-clamp-1">
                        {replyingTo.text}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-200/50 dark:hover:bg-gray-800 cursor-pointer"
                    title="Cancel reply"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="p-3 sm:p-4">
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
                      onClick={() => handleSendMessage("Check-in: Arrived at stop")}
                      className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full transition-colors flex-shrink-0 cursor-pointer"
                      title="Send quick check-in"
                    >
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
      {/* End Two-Column Viewport */}
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
