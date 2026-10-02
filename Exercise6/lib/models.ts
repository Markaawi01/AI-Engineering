import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const GENRES = [
  'Sci-Fi', 'Drama', 'Action', 'Comedy', 'Crime', 'Thriller',
  'Animation', 'Romance', 'Horror', 'Fantasy', 'Adventure',
] as const;

// Reuse a model if it already exists (Next.js hot reload would otherwise throw "Cannot overwrite model")
function getModel<T extends Schema>(name: string, schema: T) {
  return (mongoose.models[name] as Model<InferSchemaType<T>>) ||
    mongoose.model(name, schema);
}

// ---------- Movies, users, reviews (the data the Database Chat tool queries) ----------

const movieSchema = new Schema(
  {
    movieId: { type: Number, required: true, unique: true }, // the "id" from the exercise
    title: { type: String, required: true, trim: true },
    year: { type: Number, required: true, min: 1888, max: 2100 },
    genre: { type: String, required: true, enum: GENRES },
    rating: { type: Number, required: true, min: 0, max: 10 },
    director: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
  },
  { versionKey: false }
);
movieSchema.index({ genre: 1, rating: -1 }); // "sci-fi movies", "best dramas"
movieSchema.index({ rating: -1 });           // "rating above 8.5"
movieSchema.index({ year: 1 });
movieSchema.index({ title: 'text', description: 'text' });

const userSchema = new Schema(
  {
    userId: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    age: { type: Number, required: true, min: 1, max: 120 },
    favorite_genre: { type: String, enum: GENRES },
  },
  { versionKey: false }
);
userSchema.index({ age: 1 });
userSchema.index({ favorite_genre: 1 });

const reviewSchema = new Schema(
  {
    reviewId: { type: Number, required: true, unique: true },
    movie_id: { type: Number, required: true },
    user_id: { type: Number, required: true },
    rating: { type: Number, required: true, min: 1, max: 10 },
    comment: { type: String, default: '', maxlength: 1000 },
    date: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
reviewSchema.index({ movie_id: 1 });
reviewSchema.index({ user_id: 1 });

// ---------- Jokes (stored for offline access, searching and rating) ----------

const jokeSchema = new Schema(
  {
    jokeId: { type: String, required: true, unique: true },
    text: { type: String, required: true },
    category: { type: String, enum: ['dad', 'programming', 'general'], required: true },
    source: { type: String, enum: ['icanhazdadjoke', 'local'], required: true },
    thumbsUp: { type: Number, default: 0, min: 0 },
    thumbsDown: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false }
);
jokeSchema.index({ category: 1 });
jokeSchema.index({ text: 'text' }); // keyword search

// ---------- Cache for external API responses ----------

const apiCacheSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    source: { type: String, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);
// TTL index: MongoDB deletes the document automatically once expiresAt has passed
apiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ---------- Conversation history ----------

const conversationSchema = new Schema(
  {
    chatId: { type: String, required: true, unique: true },
    title: { type: String, default: 'New chat', maxlength: 100 }, // shown in the conversation sidebar
    messages: { type: [Schema.Types.Mixed], default: [] }, // AI SDK UIMessage objects
  },
  { timestamps: true, versionKey: false }
);
conversationSchema.index({ updatedAt: -1 }); // sidebar: newest conversations first

// ---------- Generated images ----------
// Images are stored in their own collection (not inside the conversation),
// so a conversation document stays small and each image is served by /api/images/<id>.

const imageSchema = new Schema(
  {
    imageId: { type: String, required: true, unique: true },
    chatId: { type: String }, // the conversation it was created in (deleted together)
    prompt: { type: String, required: true, maxlength: 1000 },
    model: { type: String, required: true },
    size: { type: String, required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
    bytes: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
imageSchema.index({ chatId: 1 });

// ---------- User preferences / settings ----------

const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    pageSize: { type: Number, default: 10, min: 1, max: 50 },
    defaultJokeCategory: { type: String, enum: ['dad', 'programming', 'general'], default: 'dad' },
    model: { type: String, default: 'openai/gpt-4o-mini' },
  },
  { timestamps: true, versionKey: false }
);

// ---------- Tool usage analytics & error log ----------

const toolUsageSchema = new Schema(
  {
    tool: { type: String, required: true },
    success: { type: Boolean, required: true },
    durationMs: { type: Number, required: true },
    cached: { type: Boolean, default: false },
    fallback: { type: Boolean, default: false },
    error: { type: String },
    input: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
toolUsageSchema.index({ tool: 1, createdAt: -1 });
toolUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // keep 90 days

const errorLogSchema = new Schema(
  {
    source: { type: String, required: true },
    message: { type: String, required: true },
    details: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // keep 30 days

export const Movie = getModel('Movie', movieSchema);
export const User = getModel('User', userSchema);
export const Review = getModel('Review', reviewSchema);
export const Joke = getModel('Joke', jokeSchema);
export const ApiCache = getModel('ApiCache', apiCacheSchema);
export const Conversation = getModel('Conversation', conversationSchema);
export const Settings = getModel('Settings', settingsSchema);
export const ToolUsage = getModel('ToolUsage', toolUsageSchema);
export const ErrorLog = getModel('ErrorLog', errorLogSchema);
export const GeneratedImage = getModel('GeneratedImage', imageSchema);

// Used by the backup/restore scripts
export const ALL_MODELS = {
  movies: Movie,
  users: User,
  reviews: Review,
  jokes: Joke,
  apicaches: ApiCache,
  conversations: Conversation,
  settings: Settings,
  toolusages: ToolUsage,
  errorlogs: ErrorLog,
  generatedimages: GeneratedImage,
} as const;
