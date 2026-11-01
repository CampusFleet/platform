import { getMongoDb } from "./mongodb";
import { supabaseAdmin } from "./supabaseClient";
import { createMessageId } from "./id";
import { cacheGet, cacheSet, cacheDel, CACHE_TTL } from "./redis";
import {
  ChatPoll,
  ChatPollOption,
  ChatTemplate,
  ChatUserSettings as FullChatUserSettings,
} from "@/types/chat";

export type { ChatPoll, ChatPollOption, ChatTemplate };
export type ChatUserSettings = FullChatUserSettings;

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

  const bulkOps: any[] = [];

  if (campuses && campuses.length > 0) {
    for (const campus of campuses) {
      const convId = campus.id;
      const initials = campus.code ? campus.code.replace(/[^A-Za-z]/g, "").substring(0, 2).toUpperCase() : getInitials(campus.name);
      bulkOps.push({
        updateOne: {
          filter: { id: convId },
          update: {
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
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
              memberIds: [],
              lastMessage: {
                text: `Welcome to ${campus.name} Hub. For transport queries, tag @transportadmin or @teacher.`,
                senderId: "system",
                senderName: "Campus Desk",
                createdAt: now,
              },
            },
          },
          upsert: true,
        },
      });
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

      bulkOps.push({
        updateOne: {
          filter: { id: convId },
          update: {
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
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
              memberIds: [],
              lastMessage: {
                text: `Bus ${bus.bus_number} group is active. Passengers can alert @driver or @conductor for live halts.`,
                senderId: "system",
                senderName: "Fleet Telematics",
                createdAt: now,
              },
            },
          },
          upsert: true,
        },
      });
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

      bulkOps.push({
        updateOne: {
          filter: { id: convId },
          update: {
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
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
              memberIds: [],
              lastMessage: {
                text: `Class transit channel ready for ${classItem.name}. Tag @teacher for gate passes and timetable shifts.`,
                senderId: "system",
                senderName: "Academic Desk",
                createdAt: now,
              },
            },
          },
          upsert: true,
        },
      });
    }
  }

  // Execute all channel updates in a single high-speed bulk write
  if (bulkOps.length > 0) {
    try {
      await convCol.bulkWrite(bulkOps, { ordered: false });
    } catch (bulkErr) {
      console.warn("[chat-mongodb] bulkWrite channels warning:", bulkErr);
    }
  }

  // Clean up any stray memberIds containing "*" across non-main channels
  try {
    await convCol.updateMany(
      { id: { $ne: "campusfleet-main" }, memberIds: "*" },
      { $pull: { memberIds: "*" } as any }
    );
  } catch (cleanErr) {
    console.warn("[chat-mongodb] memberIds cleanup warning:", cleanErr);
  }
}

/**
 * Resolves user's eligible conversations with Attribute-Based Access Control (ABAC).
 *
 * Security & Scoping Rules:
 * - A student strictly sees:
 *    1. CampusFleet Main Group
 *    2. Their assigned Campus Hub
 *    3. Their assigned Bus Number channel
 *    4. Their assigned Class channel ONLY (zero leakage of other classes)
 *    5. Direct Messages where they are in memberIds
 * - A teacher strictly sees: Main Group, Campus, and Classes they are assigned to.
 * - A driver/conductor strictly sees: Main Group, Campus, and their active Bus.
 * - Supervisors (admin, transport_admin, transport_manager) retain operational oversight.
 *
 * Performance:
 * - Backed by Upstash Redis cache-aside (CACHE_TTL.CHAT_CONVERSATIONS) for sub-2ms response.
 * - Background channel sync throttled to once per 10 minutes to eliminate 4-second latency.
 */
export async function getUserConversations(userId: string, userRole: string): Promise<ChatConversation[]> {
  const cacheKey = `chat:user:channels:${userId || "guest"}:${userRole || "student"}`;

  // 1. High-Speed Redis Cache-Aside Hit (<2ms)
  const cachedChannels = await cacheGet<ChatConversation[]>(cacheKey);
  if (cachedChannels && Array.isArray(cachedChannels) && cachedChannels.length > 0) {
    return cachedChannels;
  }

  const db = await getMongoDb();
  if (!db) return [];

  // 2. Throttled Institutional Channel Sync (runs once per 10 minutes in background)
  const syncKey = "chat:sync:channels_last_run";
  const hasSyncedRecently = await cacheGet<string>(syncKey);
  if (!hasSyncedRecently) {
    try {
      await syncConversationsFromDatabase();
      await cacheSet(syncKey, "true", 600); // 10 minutes TTL
    } catch (err) {
      console.warn("[chat-mongodb] Throttled channel sync error:", err);
    }
  }

  const convCol = db.collection("chat_conversations");

  // 3. Attribute-Based Access Control: Resolve user attributes
  const userCampusIds = new Set<string>();
  const userClassIds = new Set<string>();
  const userBusNumbers = new Set<string>();

  if (userId && userId !== "guest") {
    // A. Check user profile for direct campus linkage
    const { data: userRec } = await supabaseAdmin
      .from("users")
      .select("id, role, campus_id, campus")
      .eq("id", userId)
      .maybeSingle();

    if (userRec?.campus_id) userCampusIds.add(userRec.campus_id);
    if (userRec?.campus) userCampusIds.add(userRec.campus);

    // B. Check student record (Class, Campus, and Bus)
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, campus_id, campus, class_id, primary_route_id")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle();

    if (student) {
      if (student.campus_id) userCampusIds.add(student.campus_id);
      if (student.campus) userCampusIds.add(student.campus);
      if (student.class_id) userClassIds.add(student.class_id);

      // Bus from active or recent confirmed bookings
      const { data: studentBookings } = await supabaseAdmin
        .from("bookings")
        .select("bus_id, buses(bus_number)")
        .or(`student_id.eq.${student.id},user_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(3);

      if (studentBookings && studentBookings.length > 0) {
        for (const bk of studentBookings) {
          const bNum = (bk as any)?.buses?.bus_number;
          if (bNum) userBusNumbers.add(String(bNum));
        }
      }

      // Bus from primary route fallback
      if (userBusNumbers.size === 0 && student.primary_route_id) {
        const { data: routeBus } = await supabaseAdmin
          .from("buses")
          .select("bus_number")
          .eq("current_route_id", student.primary_route_id)
          .maybeSingle();
        if (routeBus?.bus_number) userBusNumbers.add(String(routeBus.bus_number));
      }
    }

    // C. Check teacher record
    if (userRole === "teacher") {
      const { data: assignedClasses } = await supabaseAdmin
        .from("classes")
        .select("id, campus_id")
        .eq("assigned_teacher_id", userId);
      if (assignedClasses) {
        for (const ac of assignedClasses) {
          userClassIds.add(ac.id);
          if (ac.campus_id) userCampusIds.add(ac.campus_id);
        }
      }

      const { data: teacherMappers } = await supabaseAdmin
        .from("class_teachers")
        .select("class_id")
        .eq("teacher_id", userId);
      if (teacherMappers) {
        for (const tm of teacherMappers) {
          userClassIds.add(tm.class_id);
        }
      }
    }

    // D. Check driver / conductor crew records
    if (userRole === "driver" || userRole === "conductor") {
      const { data: crewBuses } = await supabaseAdmin
        .from("buses")
        .select("bus_number, campus_id")
        .or(`driver_id.eq.${userId},conductor_id.eq.${userId}`);
      if (crewBuses) {
        for (const cb of crewBuses) {
          userBusNumbers.add(String(cb.bus_number));
          if (cb.campus_id) userCampusIds.add(cb.campus_id);
        }
      }
    }

    // Auto-enroll user into their specific assigned channels in MongoDB
    const targetGroupIds: string[] = ["campusfleet-main"];
    Array.from(userCampusIds).forEach((cId) => {
      targetGroupIds.push(cId);
      if (!cId.startsWith("campus-")) targetGroupIds.push(`campus-${cId}`);
    });
    Array.from(userClassIds).forEach((clId) => {
      targetGroupIds.push(`class-${clId}`);
    });
    Array.from(userBusNumbers).forEach((bNum) => {
      targetGroupIds.push(`bus-${bNum}`);
    });

    if (targetGroupIds.length > 0) {
      try {
        await convCol.updateMany(
          { id: { $in: targetGroupIds } },
          { $addToSet: { memberIds: userId } }
        );
      } catch (err) {
        console.warn("[chat-mongodb] Auto-enrollment error:", err);
      }
    }
  }

  // 4. Build Strict Query (Zero Leaks for ALL roles!)
  const isSupervisor = ["transport_admin", "transport_manager", "admin"].includes(userRole);

  const allowedOr: any[] = [
    // 1. Universal Main Broadcast Channel
    { id: "campusfleet-main" },
    // 2. Direct Messages where this user is an explicit participant
    { type: "DIRECT", memberIds: userId },
  ];

  // 3. User's Assigned Campus Channel(s)
  if (userCampusIds.size > 0) {
    const cList = Array.from(userCampusIds);
    const cFormatted = [...cList, ...cList.map((c) => (c.startsWith("campus-") ? c : `campus-${c}`))];
    allowedOr.push({
      category: "campus",
      $or: [
        { id: { $in: cFormatted } },
        { campusId: { $in: cFormatted } },
      ],
    });
  }

  // 4. User's Assigned Class Channel(s) ONLY
  // Strictly only classes the user is enrolled in (student) or teaches (teacher). Zero leakage!
  if (userClassIds.size > 0) {
    const clList = Array.from(userClassIds);
    const clGroupIds = clList.map((cid) => `class-${cid}`);
    allowedOr.push({
      category: "class",
      $or: [
        { id: { $in: clGroupIds } },
        { classId: { $in: clList } },
      ],
    });
  }

  // 5. User's Assigned Bus Channel(s) ONLY
  if (userBusNumbers.size > 0) {
    const bList = Array.from(userBusNumbers);
    const bGroupIds = bList.map((b) => `bus-${b}`);
    const bNumeric = bList.map((b) => Number(b)).filter((n) => !isNaN(n));
    allowedOr.push({
      category: "bus",
      $or: [
        { id: { $in: bGroupIds } },
        { busNumber: { $in: [...bList, ...bNumeric] } },
      ],
    });
  } else if (isSupervisor && userCampusIds.size > 0) {
    // Transport supervisors see the transit bus channels operating within their campus
    const cList = Array.from(userCampusIds);
    allowedOr.push({
      category: "bus",
      campusId: { $in: cList },
    });
  }

  const query: any = {
    isArchived: { $ne: true },
    name: { $not: /Corridor$/i },
    id: { $not: /^route-/i },
    $or: allowedOr,
  };

  const docs = await convCol
    .find(query)
    .sort({ "lastMessage.createdAt": -1, updatedAt: -1 })
    .toArray();

  const results: ChatConversation[] = docs.map((d) => ({
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

  // Store in Upstash Redis cache-aside (CACHE_TTL.CHAT_CONVERSATIONS)
  await cacheSet(cacheKey, results, CACHE_TTL.CHAT_CONVERSATIONS);

  return results;
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
  const defaultTemplates: ChatTemplate[] = [
    {
      id: "tpl_1",
      title: "Running late",
      message: "Running 5 minutes late for my bus stop.",
      useIn: "All chats",
      createdAt: new Date().toISOString(),
    },
    {
      id: "tpl_2",
      title: "Arrived at stop",
      message: "I have reached the stop and am waiting for the bus.",
      useIn: "All chats",
      createdAt: new Date().toISOString(),
    },
    {
      id: "tpl_3",
      title: "Boarded safely",
      message: "Boarded the bus safely, pass scanned.",
      useIn: "All chats",
      createdAt: new Date().toISOString(),
    },
  ];

  const db = await getMongoDb();
  if (!db) {
    return {
      userId,
      fullName,
      about: "Hey there! I am using CampusFleet Chat.",
      soundEnabled: true,
      notificationsEnabled: false,
      notificationTone: "Classic",
      notifications: { sound: true, mentionsOnly: false, desktop: false, tone: "Classic" },
      quickReplies: [
        "Is the bus arriving on time?",
        "I am boarding at my registered stop.",
        "Running 5 minutes late for morning shift.",
        "Confirmed, boarding pass verified.",
      ],
      templates: defaultTemplates,
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
      soundEnabled: true,
      notificationsEnabled: false,
      notificationTone: "Classic",
      notifications: { sound: true, mentionsOnly: false, desktop: false, tone: "Classic" },
      quickReplies: [
        "Is the bus arriving on time?",
        "I am boarding at my registered stop.",
        "Running 5 minutes late for morning shift.",
        "Confirmed, boarding pass verified.",
      ],
      templates: defaultTemplates,
      favorites: ["campusfleet-main"],
    };
    await setCol.insertOne(defaultSettings as any);
    return defaultSettings;
  }

  const parsed = userSettings as unknown as ChatUserSettings;
  if (!parsed.templates || parsed.templates.length === 0) {
    parsed.templates = defaultTemplates;
  }
  if (parsed.soundEnabled === undefined) {
    parsed.soundEnabled = parsed.notifications?.sound ?? true;
  }
  if (parsed.notificationTone === undefined) {
    parsed.notificationTone = parsed.notifications?.tone || "Classic";
  }

  return parsed;
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
