import { NextRequest, NextResponse } from "next/server";
import { getSession, getSessionFromRequest } from "@/lib/jwt";
import { getUserConversations, getInitials, updateConversation, deleteConversation } from "@/lib/chat-mongodb";
import { getMongoDb } from "@/lib/mongodb";
import { createConversationId } from "@/lib/id";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = (await getSessionFromRequest(req)) || (await getSession());
    const userId = session?.userId || "guest";
    const userRole = session?.role || "student";

    const conversations = await getUserConversations(userId, userRole);
    return NextResponse.json(
      { success: true, conversations },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/chat/conversations error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: "Channel creation is disabled. All CampusFleet transit channels are dynamically synchronized with institutional records.",
    },
    { status: 403 }
  );
}

export async function PATCH(req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: "Channel modification is disabled. All CampusFleet transit channels are dynamically synchronized.",
    },
    { status: 403 }
  );
}

export async function DELETE(req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: "Channel deletion is disabled. All CampusFleet transit channels are automated institutional groups.",
    },
    { status: 403 }
  );
}
