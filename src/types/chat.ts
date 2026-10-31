export interface ChatConversation {
  id: string; // Mongo ObjectId or unique string
  type: "GROUP" | "DIRECT" | "BROADCAST" | "ANNOUNCEMENT";
  name: string;
  description?: string;
  avatarInitials?: string;
  avatarBg?: string;
  category?: "main" | "campus" | "bus" | "class" | "direct";
  campusId?: string | null;
  busId?: string | null;
  busNumber?: number | string | null;
  classId?: string | null;
  routeId?: string | null;
  shiftId?: string | null;
  isAutoAssigned?: boolean;
  memberIds: string[];
  adminIds?: string[];
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
  unreadCount?: number;
  isPinned?: boolean;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatPollOption {
  id: string;
  text: string;
  votes: number;
  voterIds: string[];
}

export interface ChatPoll {
  question: string;
  options: ChatPollOption[];
  allowMultiple?: boolean;
  totalVotes: number;
  closed?: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  senderAvatar?: string;
  text: string;
  isEdited?: boolean;
  poll?: ChatPoll;
  mentions?: {
    type: "ROLE" | "USER";
    role?: string;
    label: string;
  }[];
  attachments?: {
    type: "image" | "file" | "voice";
    url: string;
    name?: string;
    size?: number;
  }[];
  reactions?: {
    emoji: string;
    count: number;
    userIds: string[];
  }[];
  createdAt: string;
  updatedAt?: string;
}

export interface ChatUserSettings {
  userId: string;
  fullName?: string;
  about?: string;
  theme?: "system" | "dark" | "light";
  quickReplies?: string[];
  soundEnabled?: boolean;
  notificationsEnabled?: boolean;
  favorites?: string[];
  notifications?: {
    sound: boolean;
    mentionsOnly: boolean;
  };
}

export const PASTEL_AVATARS = [
  "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300",
  "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-300",
];

export function getInitials(name: string): string {
  if (!name) return "CF";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
