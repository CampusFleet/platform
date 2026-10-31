import { getMongoDb } from "./mongodb";
import { supabaseAdmin } from "./supabaseClient";
import { createMessageId } from "./id";
import { cacheGet, cacheSet, cacheDel, CACHE_TTL } from "./redis";
import { ChatPoll, ChatPollOption } from "@/types/chat";

export type { ChatPoll, ChatPollOption };

export interface ChatConversation {
  id: string;
  type: "GROUP" | "DIRECT" | "ANNOUNCEMENT";
  name: string;
  description?: string;
  avatarInitials: string;
  avatarBg: string;
  category?: "main" | "campus" | "bus" | "class" | "direct";
  campusId?: string;
  busId?: string;
  busNumber?: number | string;
  classId?: string;
  routeId?: string;
  isAutoAssigned?: boolean;
  memberIds: string[];
  adminIds?: string[];
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  };
  unreadCount?: number;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatar?: string;
  text: string;
  poll?: ChatPoll;
  mentions?: {
    type: "ROLE" | "USER";
    role?: string;
    userId?: string;
    label: string;
  }[];
  attachments?: {
    name: string;
    url: string;
    type: "IMAGE" | "FILE" | "PASS";
    size?: string;
  }[];
  reactions?: {
    emoji: string;
    count: number;
    userIds: string[];
  }[];
  isEdited?: boolean;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ChatUserSettings {
  userId: string;
  fullName: string;
  about: string;
  notifications: {
    sound: boolean;
    mentionsOnly: boolean;
  };
  quickReplies: string[];
  favorites: string[];
}

export const PASTEL_AVATARS = [
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300",
];

export function getInitials(name: string): string {
  if (!name) return "CF";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Dynamically synchronizes conversations into MongoDB directly from Supabase entities:
 * 1. CampusFleet Main Group (University-wide)
 * 2. Campus Groups (from campuses table)
 * 3. Bus Number Groups (from buses table - Bus 02, Bus 37, Bus 44, etc.)
 * 4. Particular Class Groups (from classes table - B.Tech CSE, BCA, etc.)
 * 
 * Strict Domain Rule: No corridor groups. Commuters only interact with their physical Bus Number, Class, Campus & Main groups.
 */
export async function syncConversationsFromDatabase(): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;

  const convCol = db.collection("chat_conversations");
  const msgCol = db.collection("chat_messages");

  // Ensure unique index
  await convCol.createIndex({ id: 1 }, { unique: true });
  await convCol.createIndex({ memberIds: 1 });
  await convCol.createIndex({ category: 1 });
  await msgCol.createIndex({ conversationId: 1, createdAt: 1 });

  const now = new Date().toISOString();

  // 0. Purge legacy corridor/route groups and duplicate campus groups completely from MongoDB
  try {
    await convCol.deleteMany({
      $or: [
        { routeId: { $exists: true, $ne: null } },
        { id: { $regex: /^route-/i } },
        { id: { $regex: /^route_bus_/i } },
        { id: { $regex: /^campus-campus-/i } },
        { name: { $regex: /Corridor$/i } },
        { name: { $regex: /to GEHU Bhimtal Corridor/i } },
      ],
    });
  } catch (err) {
    console.warn("Could not purge legacy corridor groups:", err);
  }

  // 1. Ensure Main Official Group exists (CampusFleet Main Group)
  await convCol.updateOne(
    { id: "campusfleet-main" },
    {
      $set: {
        id: "campusfleet-main",
        type: "GROUP",
        category: "main",
        name: "CampusFleet Main Group",
        description: "Official university-wide campus transit community, fleet broadcast & central operations channel.",
        avatarInitials: "CF",
        avatarBg: "bg-blue-600 text-white",
        isAutoAssigned: true,
        memberIds: ["*"],
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
        lastMessage: {
          text: "Welcome to CampusFleet Main Group! All students, faculty, and fleet operations crew are synchronized here.",
          senderId: "system",
          senderName: "Operations Desk",
          createdAt: now,
        },
      },
    },
    { upsert: true }
  );

  // 2. Query dynamic campuses from Supabase database (Campus Groups)
  const { data: campuses } = await supabaseAdmin
    .from("campuses")
    .select("id, name, code");

  if (campuses && campuses.length > 0) {
    for (const campus of campuses) {
      // Primary key in campuses table is already canonical (e.g. "campus-gehu-bhimtal")
      const convId = campus.id;
      const initials = campus.code ? campus.code.replace(/[^A-Za-z]/g, "").substring(0, 2).toUpperCase() : getInitials(campus.name);
      await convCol.updateOne(
        { id: convId },
        {
          $set: {
            id: convId,
            type: "GROUP",
            category: "campus",
            name: `${campus.name}`,
            description: `Official campus transit hub and student body coordination channel for ${campus.name}.`,
            avatarInitials: initials,
            avatarBg: "bg-emerald-600 text-white",
            campusId: campus.id,
            isAutoAssigned: true,
            memberIds: ["*"],
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
            lastMessage: {
              text: `Welcome to ${campus.name} Hub. For transport queries, tag @transportadmin or @teacher.`,
              senderId: "system",
              senderName: "Campus Desk",
              createdAt: now,
            },
          },
        },
        { upsert: true }
      );
    }
  }

  // 3. Query physical buses from Supabase database (Bus Number Groups)
  const { data: buses } = await supabaseAdmin
    .from("buses")
    .select("id, bus_number, registration_no, capacity, campus_id")
    .order("bus_number");

  if (buses && buses.length > 0) {
    for (const bus of buses) {
      const convId = `bus-${bus.bus_number}`;
      const busNumStr = String(bus.bus_number);
      const initials = busNumStr.padStart(2, "0");

      await convCol.updateOne(
        { id: convId },
        {
          $set: {
            id: convId,
            type: "GROUP",
            category: "bus",
            name: `Bus ${bus.bus_number}`,
            description: `Official passenger & crew channel for Bus ${bus.bus_number} (${bus.registration_no || "CampusFleet"}). Live passenger halts, driver alerts & conductor updates.`,
            avatarInitials: initials,
            avatarBg: "bg-amber-600 text-white",
            busId: String(bus.id),
            busNumber: bus.bus_number,
            campusId: bus.campus_id,
            isAutoAssigned: true,
            memberIds: ["*"],
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
            lastMessage: {
              text: `Bus ${bus.bus_number} group is active. Passengers can alert @driver or @conductor for live halts.`,
              senderId: "system",
              senderName: "Fleet Telematics",
              createdAt: now,
            },
          },
        },
        { upsert: true }
      );
    }
  }

  // 4. Query particular academic classes from Supabase database (Class Groups)
  const { data: classes } = await supabaseAdmin
    .from("classes")
    .select("id, name, semester")
    .order("name");

  if (classes && classes.length > 0) {
    for (const classItem of classes) {
      const convId = `class-${classItem.id}`;
      const initials = getInitials(classItem.name);

      await convCol.updateOne(
        { id: convId },
        {
          $set: {
            id: convId,
            type: "GROUP",
            category: "class",
            name: `${classItem.name}`,
            description: `Official academic class transit & lecture-shift commute group for ${classItem.name}.`,
            avatarInitials: initials,
            avatarBg: "bg-indigo-600 text-white",
            classId: classItem.id,
            isAutoAssigned: true,
            memberIds: ["*"],
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
            lastMessage: {
              text: `Class transit channel ready for ${classItem.name}. Tag @teacher for gate passes and timetable shifts.`,
              senderId: "system",
              senderName: "Academic Desk",
              createdAt: now,
            },
          },
        },
        { upsert: true }
      );
    }
  }
}

/**
 * Resolves user's eligible conversations from MongoDB.
 * Automatically adds the user into the memberIds of their assigned automated groups:
 * - CampusFleet Main Group
 * - Their Campus Group
 * - Their Bus Number Group
 * - Their Class Group
 */
export async function getUserConversations(userId: string, userRole: string): Promise<ChatConversation[]> {
  const db = await getMongoDb();
  if (!db) return [];

  // Synchronize dynamic channels from Supabase tables into MongoDB
  await syncConversationsFromDatabase();

  const convCol = db.collection("chat_conversations");

  let userCampusId = "";
  let userClassId = "";
  let userBusNumber = "";

  if (userId && userId !== "guest") {
    // 1. Resolve student record
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, campus_id, class_id, primary_route_id")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();

    if (student) {
      if (student.campus_id) userCampusId = student.campus_id;
      if (student.class_id) userClassId = student.class_id;

      // Resolve bus number from route or active bookings
      if (student.primary_route_id) {
        const { data: bus } = await supabaseAdmin
          .from("buses")
          .select("bus_number")
          .eq("current_route_id", student.primary_route_id)
          .maybeSingle();
        if (bus) userBusNumber = String(bus.bus_number);
      }

      if (!userBusNumber) {
        const { data: booking } = await supabaseAdmin
          .from("bookings")
          .select("buses(bus_number)")
          .eq("student_id", student.id || userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if ((booking as any)?.buses?.bus_number) {
          userBusNumber = String((booking as any).buses.bus_number);
        }
      }
    }

    // 2. Resolve teacher/faculty record if not student
    if (!student) {
      const { data: teacherClass } = await supabaseAdmin
        .from("classes")
        .select("id, name")
        .eq("assigned_teacher_id", userId)
        .maybeSingle();
      if (teacherClass) userClassId = teacherClass.id;
    }

    // 3. Resolve driver/conductor bus
    if (userRole === "driver" || userRole === "conductor") {
      const { data: busStaff } = await supabaseAdmin
        .from("buses")
        .select("bus_number, campus_id")
        .or(`driver_id.eq.${userId},conductor_id.eq.${userId}`)
        .maybeSingle();
      if (busStaff) {
        userBusNumber = String(busStaff.bus_number);
        if (busStaff.campus_id) userCampusId = busStaff.campus_id;
      }
    }

    // Automatically enroll user into their groups in MongoDB
    const targetGroupIds: string[] = ["campusfleet-main"];
    if (userCampusId) targetGroupIds.push(userCampusId);
    if (userBusNumber) targetGroupIds.push(`bus-${userBusNumber}`);
    if (userClassId) targetGroupIds.push(`class-${userClassId}`);

    try {
      await convCol.updateMany(
        { id: { $in: targetGroupIds } },
        { $addToSet: { memberIds: userId } }
      );
    } catch (err) {
      console.warn("Auto-enrollment update error:", err);
    }
  }

  // Super-admin & manager roles can see all institutional channels
  const isSupervisor = ["transport_admin", "transport_manager", "admin"].includes(userRole);

  const query: any = {
    isArchived: { $ne: true },
    name: { $not: /Corridor$/i },
    id: { $not: /^route-/i },
  };

  if (!isSupervisor) {
    query.$or = [
      { memberIds: "*" },
      { memberIds: userId },
      { isAutoAssigned: true },
    ];
    if (userCampusId) query.$or.push({ campusId: userCampusId });
    if (userClassId) query.$or.push({ classId: userClassId });
    if (userBusNumber) query.$or.push({ busNumber: Number(userBusNumber) || userBusNumber });
  }

  const docs = await convCol
    .find(query)
    .sort({ "lastMessage.createdAt": -1, updatedAt: -1 })
    .toArray();

  return docs.map((d) => ({
    id: d.id || String(d._id),
    type: d.type || "GROUP",
    category: d.category || (d.id === "campusfleet-main" ? "main" : d.id?.startsWith("bus-") ? "bus" : d.id?.startsWith("class-") ? "class" : d.id?.startsWith("campus-") ? "campus" : "direct"),
    name: d.name,
    description: d.description,
    avatarInitials: d.avatarInitials || getInitials(d.name),
    avatarBg: d.avatarBg || "bg-blue-600 text-white",
    campusId: d.campusId,
    busId: d.busId,
    busNumber: d.busNumber,
    classId: d.classId,
    routeId: d.routeId,
    isAutoAssigned: d.isAutoAssigned,
    memberIds: d.memberIds || [],
    adminIds: d.adminIds || [],
    lastMessage: d.lastMessage,
    unreadCount: d.unreadCount || 0,
    isArchived: d.isArchived,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

/**
 * CRUD: Create a new conversation or direct chat channel in MongoDB
 */
export async function createConversation(data: {
  name: string;
  type?: "GROUP" | "DIRECT" | "ANNOUNCEMENT";
  description?: string;
  creatorId: string;
  memberIds?: string[];
  campusId?: string;
  routeId?: string;
}): Promise<ChatConversation | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const now = new Date().toISOString();
  const convCol = db.collection("chat_conversations");

  const convId = data.type === "DIRECT"
    ? `dm_${[data.creatorId, ...(data.memberIds || [])].sort().join("_")}`
    : `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newDoc: ChatConversation = {
    id: convId,
    type: data.type || "GROUP",
    name: data.name,
    description: data.description || "",
    avatarInitials: getInitials(data.name),
    avatarBg: "bg-blue-600 text-white",
    campusId: data.campusId,
    routeId: data.routeId,
    memberIds: Array.from(new Set([data.creatorId, ...(data.memberIds || [])])),
    adminIds: [data.creatorId],
    createdAt: now,
    updatedAt: now,
  };

  await convCol.updateOne(
    { id: convId },
    { $setOnInsert: newDoc },
    { upsert: true }
  );

  return newDoc;
}

/**
 * CRUD: Update conversation properties (name, description, members, archive)
 */
export async function updateConversation(
  convId: string,
  updates: Partial<ChatConversation>
): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;

  const convCol = db.collection("chat_conversations");
  const result = await convCol.updateOne(
    { id: convId },
    {
      $set: {
        ...updates,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  return result.matchedCount > 0;
}

/**
 * CRUD: Delete or archive a conversation in MongoDB
 */
export async function deleteConversation(convId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;

  const convCol = db.collection("chat_conversations");
  const msgCol = db.collection("chat_messages");

  // Remove messages and conversation
  await msgCol.deleteMany({ conversationId: convId });
  const result = await convCol.deleteOne({ id: convId });
  await cacheDel(`chat:msgs:${convId}`);

  return result.deletedCount > 0;
}

/**
 * Fetch messages for a conversation with pagination (Redis Cached for sub-2ms retrieval)
 */
export async function getConversationMessages(conversationId: string, limit = 60): Promise<ChatMessage[]> {
  const cacheKey = `chat:msgs:${conversationId}`;

  // 1. Check Redis cache first (sub-2ms response)
  const cached = await cacheGet<ChatMessage[]>(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached.slice(0, limit);
  }

  // 2. Fall back to MongoDB Atlas system of record
  const db = await getMongoDb();
  if (!db) return cached || [];

  const msgCol = db.collection("chat_messages");
  const docs = await msgCol
    .find({ conversationId, isDeleted: { $ne: true } })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  const messages: ChatMessage[] = docs.map((d) => ({
    id: d.id || String(d._id),
    conversationId: d.conversationId,
    senderId: d.senderId,
    senderName: d.senderName,
    senderRole: d.senderRole,
    senderAvatar: d.senderAvatar,
    text: d.text,
    mentions: d.mentions,
    poll: d.poll,
    attachments: d.attachments,
    reactions: d.reactions,
    isEdited: d.isEdited,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));

  // 3. Populate Redis cache with sliding expiration
  if (messages.length > 0) {
    await cacheSet(cacheKey, messages, CACHE_TTL.CHAT_MESSAGES);
  }

  return messages;
}

/**
 * CRUD: Create/Send a chat message with @mention extraction and optional poll
 */
export async function sendChatMessage(params: {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderAvatar?: string;
  text: string;
  poll?: ChatMessage["poll"];
  attachments?: ChatMessage["attachments"];
}): Promise<ChatMessage | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const now = new Date().toISOString();
  const id = createMessageId();

  // Parse @mentions
  const mentions: ChatMessage["mentions"] = [];
  const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
  let match;
  while ((match = mentionRegex.exec(params.text)) !== null) {
    const rawTag = match[1].toLowerCase();
    if (["transportadmin", "transportmanager", "teacher", "driver", "conductor", "admin"].includes(rawTag)) {
      mentions.push({
        type: "ROLE",
        role: rawTag,
        label: `@${match[1]}`,
      });
    } else {
      mentions.push({
        type: "USER",
        label: `@${match[1]}`,
      });
    }
  }

  const newMessage: ChatMessage = {
    id,
    conversationId: params.conversationId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderRole: params.senderRole,
    senderAvatar: params.senderAvatar,
    text: params.text,
    poll: params.poll,
    mentions: mentions.length > 0 ? mentions : undefined,
    attachments: params.attachments,
    reactions: [],
    createdAt: now,
  };

  const msgCol = db.collection("chat_messages");
  const convCol = db.collection("chat_conversations");

  await msgCol.insertOne(newMessage as any);

  const previewText = params.poll ? `📊 Poll: ${params.poll.question}` : params.text;

  await convCol.updateOne(
    { id: params.conversationId },
    {
      $set: {
        lastMessage: {
          text: previewText,
          senderId: params.senderId,
          senderName: params.senderName,
          createdAt: now,
        },
        updatedAt: now,
      },
    },
    { upsert: false }
  );

  // Maintain high-speed Redis cache (rolling window of latest 100 messages)
  const cacheKey = `chat:msgs:${params.conversationId}`;
  const cached = await cacheGet<ChatMessage[]>(cacheKey);
  if (cached && Array.isArray(cached)) {
    const updated = [...cached, newMessage].slice(-100);
    await cacheSet(cacheKey, updated, CACHE_TTL.CHAT_MESSAGES);
  } else {
    await cacheDel(cacheKey);
  }

  return newMessage;
}

/**
 * CRUD: Cast or toggle a vote on an interactive chat poll
 */
export async function voteChatMessagePoll(
  messageId: string,
  optionId: string,
  userId: string
): Promise<ChatMessage["poll"] | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const msgCol = db.collection("chat_messages");
  const msgDoc = await msgCol.findOne({ id: messageId });
  if (!msgDoc || !msgDoc.poll) return null;

  const poll = msgDoc.poll;
  const allowMultiple = Boolean(poll.allowMultiple);

  // If single-choice, remove user from other options
  if (!allowMultiple) {
    for (const opt of poll.options) {
      if (opt.id !== optionId) {
        opt.voterIds = (opt.voterIds || []).filter((id: string) => id !== userId);
        opt.votes = opt.voterIds.length;
      }
    }
  }

  // Toggle user vote on target option
  const targetOpt = poll.options.find((o: any) => o.id === optionId);
  if (targetOpt) {
    const currentVoters: string[] = targetOpt.voterIds || [];
    if (currentVoters.includes(userId)) {
      targetOpt.voterIds = currentVoters.filter((id) => id !== userId);
    } else {
      targetOpt.voterIds = [...currentVoters, userId];
    }
    targetOpt.votes = targetOpt.voterIds.length;
  }

  // Recalculate unique total voters
  const allVoters = new Set<string>();
  for (const opt of poll.options) {
    for (const vid of opt.voterIds || []) {
      allVoters.add(vid);
    }
  }
  poll.totalVotes = allVoters.size;

  await msgCol.updateOne(
    { id: messageId },
    { $set: { poll, updatedAt: new Date().toISOString() } }
  );

  // Invalidate Redis message cache so all clients receive updated vote counts instantly
  if (msgDoc.conversationId) {
    await cacheDel(`chat:msgs:${msgDoc.conversationId}`);
  }

  return poll;
}

/**
 * CRUD: Update an existing message text
 */
export async function updateChatMessage(messageId: string, newText: string, userId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;

  const msgCol = db.collection("chat_messages");
  const result = await msgCol.updateOne(
    { id: messageId, senderId: userId },
    {
      $set: {
        text: newText,
        isEdited: true,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  if (result.matchedCount > 0) {
    const msg = await msgCol.findOne({ id: messageId });
    if (msg?.conversationId) {
      await cacheDel(`chat:msgs:${msg.conversationId}`);
    }
  }

  return result.matchedCount > 0;
}

/**
 * CRUD: Delete a chat message (soft delete)
 */
export async function deleteChatMessage(messageId: string, userId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;

  const msgCol = db.collection("chat_messages");
  const result = await msgCol.updateOne(
    { id: messageId, senderId: userId },
    {
      $set: {
        isDeleted: true,
        text: "This message was deleted.",
        attachments: [],
        updatedAt: new Date().toISOString(),
      },
    }
  );

  if (result.matchedCount > 0) {
    const msg = await msgCol.findOne({ id: messageId });
    if (msg?.conversationId) {
      await cacheDel(`chat:msgs:${msg.conversationId}`);
    }
  }

  return result.matchedCount > 0;
}

/**
 * Toggle emoji reaction on a message
 */
export async function toggleMessageReaction(messageId: string, emoji: string, userId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;

  const msgCol = db.collection("chat_messages");
  const msg = await msgCol.findOne({ id: messageId });
  if (!msg) return false;

  let reactions = msg.reactions || [];
  const existingReactionIndex = reactions.findIndex((r: any) => r.emoji === emoji);

  if (existingReactionIndex >= 0) {
    const r = reactions[existingReactionIndex];
    if (r.userIds.includes(userId)) {
      r.userIds = r.userIds.filter((id: string) => id !== userId);
      r.count = r.userIds.length;
      if (r.count === 0) reactions.splice(existingReactionIndex, 1);
      else reactions[existingReactionIndex] = r;
    } else {
      r.userIds.push(userId);
      r.count = r.userIds.length;
    }
  } else {
    reactions.push({
      emoji,
      count: 1,
      userIds: [userId],
    });
  }

  await msgCol.updateOne({ id: messageId }, { $set: { reactions } });

  if (msg.conversationId) {
    await cacheDel(`chat:msgs:${msg.conversationId}`);
  }

  return true;
}

/**
 * Get or create user chat settings from MongoDB
 */
export async function getChatUserSettings(userId: string, fullName: string): Promise<ChatUserSettings> {
  const db = await getMongoDb();
  if (!db) {
    return {
      userId,
      fullName,
      about: "Hey there! I am using CampusFleet Chat.",
      notifications: { sound: true, mentionsOnly: false },
      quickReplies: [
        "Is the bus arriving on time?",
        "I am boarding at my registered stop.",
        "Running 5 minutes late for morning shift.",
        "Confirmed, boarding pass verified.",
      ],
      favorites: ["campusfleet-main"],
    };
  }

  const setCol = db.collection("chat_user_settings");
  let userSettings = await setCol.findOne({ userId });

  if (!userSettings) {
    const defaultSettings: ChatUserSettings = {
      userId,
      fullName: fullName || "CampusFleet Member",
      about: "Hey there! I am using CampusFleet Chat.",
      notifications: { sound: true, mentionsOnly: false },
      quickReplies: [
        "Is the bus arriving on time?",
        "I am boarding at my registered stop.",
        "Running 5 minutes late for morning shift.",
        "Confirmed, boarding pass verified.",
      ],
      favorites: ["campusfleet-main"],
    };
    await setCol.insertOne(defaultSettings as any);
    return defaultSettings;
  }

  return userSettings as unknown as ChatUserSettings;
}

/**
 * Update user chat settings in MongoDB
 */
export async function updateChatUserSettings(userId: string, updates: Partial<ChatUserSettings>): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;

  const setCol = db.collection("chat_user_settings");
  await setCol.updateOne(
    { userId },
    { $set: updates },
    { upsert: true }
  );
  return true;
}
