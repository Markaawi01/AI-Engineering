// Backup strategy:
//   npm run backup                 -> saves every collection to backups/<date-time>/<collection>.json
//   npm run restore -- <folder>    -> replaces the data with a backup
// Keeps the 7 newest backups and deletes older ones. Run it daily (e.g. Windows Task Scheduler).

import fs from 'fs/promises';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../lib/db';
import { ALL_MODELS } from '../lib/models';

try { process.loadEnvFile('.env.local'); } catch { /* use existing environment */ }

const BACKUP_DIR = path.resolve('backups');
const KEEP = 7;

// EJSON keeps MongoDB types (dates, ObjectIds) so a restore gives back exactly the same data
const { EJSON } = mongoose.mongo.BSON;

async function backup() {
  const folder = path.join(BACKUP_DIR, new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(folder, { recursive: true });

  for (const [name, model] of Object.entries(ALL_MODELS)) {
    const docs = await model.collection.find().toArray();
    await fs.writeFile(path.join(folder, `${name}.json`), EJSON.stringify(docs, undefined, 2, { relaxed: false }));
    console.log(`  ${name}: ${docs.length} documents`);
  }
  console.log(`Backup saved to ${folder}`);

  const all = (await fs.readdir(BACKUP_DIR)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
    await fs.rm(path.join(BACKUP_DIR, old), { recursive: true });
    console.log(`  removed old backup ${old}`);
  }
}

async function restore(folderName?: string) {
  const all = (await fs.readdir(BACKUP_DIR)).sort();
  const chosen = folderName ?? all.at(-1);
  if (!chosen) throw new Error('No backups found');
  const folder = path.join(BACKUP_DIR, chosen);

  for (const [name, model] of Object.entries(ALL_MODELS)) {
    const file = path.join(folder, `${name}.json`);
    const docs = EJSON.parse(await fs.readFile(file, 'utf8').catch(() => '[]')) as Record<string, unknown>[];
    await model.collection.deleteMany({});
    if (docs.length) await model.collection.insertMany(docs);
    console.log(`  ${name}: restored ${docs.length} documents`);
  }
  console.log(`Restored from ${folder}`);
}

const [command, arg] = process.argv.slice(2);

connectDB()
  .then(() => (command === 'restore' ? restore(arg) : backup()))
  .catch((error) => {
    console.error('Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
