import type { mongo } from 'mongoose';
import { errorResponse } from '@/lib/api';
import { connectDB } from '@/lib/db';
import { GeneratedImage } from '@/lib/models';

// GET /api/images/<imageId> - the image file itself (used by <img src> and the download link)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Image not found' }, { status: 404 });

    await connectDB();
    const image = await GeneratedImage.findOne({ imageId: id }, { data: 1, contentType: 1 }).lean();
    if (!image) return Response.json({ error: 'Image not found' }, { status: 404 });

    // With .lean() MongoDB returns a BSON Binary, not a Buffer - copy out its bytes
    const raw = image.data as unknown as Buffer | mongo.Binary;
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw.buffer.subarray(0, raw.length()));

    const download = new URL(req.url).searchParams.has('download');
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': image.contentType,
        // An image never changes, so the browser can keep it for a year
        'Cache-Control': 'public, max-age=31536000, immutable',
        ...(download && { 'Content-Disposition': `attachment; filename="image-${id.slice(0, 8)}.png"` }),
      },
    });
  } catch (error) {
    return errorResponse('api/images', error);
  }
}
