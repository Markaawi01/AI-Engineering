import mongoose from 'mongoose';

// Next.js reloads files during development, so we keep the connection on `globalThis`
// to reuse it instead of opening a new one on every request.
const globalForMongoose = globalThis as unknown as {
  mongooseConnection?: Promise<typeof mongoose>;
};

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) throw new DatabaseError('MONGODB_URI is not set. Add it to .env.local');

  if (!globalForMongoose.mongooseConnection) {
    globalForMongoose.mongooseConnection = mongoose
      .connect(uri, {
        maxPoolSize: 10, // connection pooling: up to 10 connections shared by all requests
        ignoreUndefined: true, // don't turn `undefined` into `null` - the AI SDK rejects null message fields
        serverSelectionTimeoutMS: 5000, // fail fast if MongoDB is not running
      })
      .catch((error) => {
        // Forget the failed attempt so the next request tries again
        globalForMongoose.mongooseConnection = undefined;
        throw new DatabaseError(
          `Could not connect to MongoDB (${error.message}). Is the MongoDB service running?`
        );
      });
  }

  return globalForMongoose.mongooseConnection;
}

export async function disconnectDB() {
  if (globalForMongoose.mongooseConnection) {
    await mongoose.disconnect();
    globalForMongoose.mongooseConnection = undefined;
  }
}
