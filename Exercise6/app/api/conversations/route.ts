import { errorResponse } from '@/lib/api';
import { connectDB } from '@/lib/db';
import { Conversation } from '@/lib/models';

// GET /api/conversations?q=<search> - list for the sidebar, newest first.
// Only titles and counts are sent, not the messages, so the list stays small and fast.
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get('q')?.trim().slice(0, 100);
    await connectDB();

    const match: Record<string, unknown> = { 'messages.0': { $exists: true } }; // skip empty chats
    if (q) match.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const conversations = await Conversation.aggregate([
      { $match: match },
      { $sort: { updatedAt: -1 } }, // uses the updatedAt index
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          id: '$chatId',
          title: { $ifNull: ['$title', 'New chat'] },
          updatedAt: 1,
          messageCount: { $size: '$messages' },
        },
      },
    ]);

    return Response.json({ conversations });
  } catch (error) {
    return errorResponse('api/conversations', error);
  }
}
