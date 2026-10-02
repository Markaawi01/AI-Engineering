import { errorResponse } from '@/lib/api';
import { connectDB } from '@/lib/db';
import { Conversation } from '@/lib/models';

// GET /api/conversations/<chatId> - load a saved conversation (used when the page reloads)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await connectDB();
    const conversation = await Conversation.findOne({ chatId: id }).lean();
    return Response.json({ id, messages: conversation?.messages ?? [] });
  } catch (error) {
    return errorResponse('api/conversations', error);
  }
}

// DELETE /api/conversations/<chatId> - the "Clear chat" button
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await connectDB();
    await Conversation.deleteOne({ chatId: id });
    return Response.json({ deleted: true });
  } catch (error) {
    return errorResponse('api/conversations', error);
  }
}
