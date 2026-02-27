// GET /api/slides/:id/chat/:chatId — get chat messages

import { NextRequest } from "next/server";
import { getChatMessages } from "@/lib/db/queries";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; chatId: string }> },
) {
  const { chatId } = await params;
  const messages = getChatMessages(chatId);
  return Response.json(messages);
}
