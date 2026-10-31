import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { voteChatMessagePoll } from "@/lib/chat-mongodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const body = await req.json();
    const { messageId, optionId } = body;

    const userId = session?.userId || body.userId;

    if (!messageId || !optionId || !userId) {
      return NextResponse.json(
        { success: false, error: "messageId, optionId, and userId are required" },
        { status: 400 }
      );
    }

    const updatedPoll = await voteChatMessagePoll(messageId, optionId, userId);

    if (!updatedPoll) {
      return NextResponse.json(
        { success: false, error: "Poll not found or voting failed" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, poll: updatedPoll });
  } catch (error: any) {
    console.error("POST /api/chat/polls error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
