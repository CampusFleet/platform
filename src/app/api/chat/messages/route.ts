import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/jwt";
import { getConversationMessages, sendChatMessage, updateChatMessage, deleteChatMessage } from "@/lib/chat-mongodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!conversationId) {
      return NextResponse.json({ success: false, error: "conversationId is required" }, { status: 400 });
    }

    const messages = await getConversationMessages(conversationId);
    return NextResponse.json({ success: true, messages });
  } catch (error: any) {
    console.error("GET /api/chat/messages error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const body = await req.json();
    const { conversationId, text, attachments, poll } = body;

    if (!conversationId || (!text && (!attachments || attachments.length === 0) && !poll)) {
      return NextResponse.json({ success: false, error: "conversationId and text, poll, or attachment are required" }, { status: 400 });
    }

    const senderId = session?.userId || body.senderId || "usr_guest";
    const senderName = session?.email?.split("@")[0] || body.senderName || "Campus Commuter";
    const senderRole = session?.role || body.senderRole || "student";

    const message = await sendChatMessage({
      conversationId,
      senderId,
      senderName,
      senderRole,
      text: text || (poll ? `📊 ${poll.question}` : ""),
      poll,
      attachments,
    });

    if (!message) {
      return NextResponse.json({ success: false, error: "Failed to save message in MongoDB" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message });
  } catch (error: any) {
    console.error("POST /api/chat/messages error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    const body = await req.json();
    const { messageId, text } = body;

    if (!messageId || !text) {
      return NextResponse.json({ success: false, error: "messageId and text are required" }, { status: 400 });
    }

    const userId = session?.userId || body.userId || "usr_guest";
    const ok = await updateChatMessage(messageId, text, userId);

    return NextResponse.json({ success: ok });
  } catch (error: any) {
    console.error("PATCH /api/chat/messages error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("messageId");

    if (!messageId) {
      return NextResponse.json({ success: false, error: "messageId is required" }, { status: 400 });
    }

    const userId = session?.userId || "usr_guest";
    const ok = await deleteChatMessage(messageId, userId);

    return NextResponse.json({ success: ok });
  } catch (error: any) {
    console.error("DELETE /api/chat/messages error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
