import { errorResponse } from '@/lib/api';
import { connectDB } from '@/lib/db';
import { Conversation } from '@/lib/models';
import { deleteImagesForChat } from '@/lib/tools/images';

// GET /api/conversations/<chatId> - load a saved conversation (clicking it in the sidebar)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await connectDB();
    const conversation = await Conversation.findOne({ chatId: id }).lean();
    return Response.json({
      id,
      title: conversation?.title ?? 'New chat',
      messages: conversation?.messages ?? [],
    });
  } catch (error) {
    return errorResponse('api/conversations', error);
  }
}

// DELETE /api/conversations/<chatId> - delete a conversation and the images created in it
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await connectDB();
    const [{ deletedCount }, imagesDeleted] = await Promise.all([
      Conversation.deleteOne({ chatId: id }),
      deleteImagesForChat(id),
    ]);
    return Response.json({ deleted: deletedCount > 0, imagesDeleted });
  } catch (error) {
    return errorResponse('api/conversations', error);
  }
}
