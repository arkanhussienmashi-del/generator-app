import Dexie, { type Table } from 'dexie';
import { setEmailCache } from './db';

const WORKER_SESSION_KEY = 'generator_app_worker_session';

export interface StoredUser {
  id?: number;
  email: string;
  password: string;
  ownerName: string;
}

export interface WorkerSession {
  code: string;
  generatorId: number;
  generatorName: string;
  ownerEmail?: string;
}

class AuthDB extends Dexie {
  users!: Table<StoredUser>;
  session!: Table<{ id: string; email: string }>;

  constructor() {
    super('AuthDB');
    this.version(1).stores({
      users: '++id, email, password, ownerName',
      session: 'id',
    });
  }
}

let authDb: AuthDB | null = null;

function getAuthDb(): AuthDB {
  if (!authDb) authDb = new AuthDB();
  return authDb;
}

export async function hasUsers(): Promise<boolean> {
  const db = getAuthDb();
  const count = await db.users.count();
  return count > 0;
}

export async function hasUsersSync(): Promise<boolean> {
  return hasUsers();
}

export async function registerUser(email: string, password: string, ownerName: string): Promise<boolean> {
  const db = getAuthDb();
  const key = email.toLowerCase().trim();
  const existing = await db.users.where('email').equals(key).first();
  if (existing) return false;
  await db.users.add({ email: key, password, ownerName });
  await db.session.put({ id: 'current', email: key });
  setEmailCache(key);
  return true;
}

export async function loginUser(email: string, password: string): Promise<boolean> {
  const db = getAuthDb();
  const key = email.toLowerCase().trim();
  const user = await db.users.where('email').equals(key).first();
  if (!user) return false;
  if (user.password !== password) return false;
  await db.session.put({ id: 'current', email: key });
  setEmailCache(key);
  return true;
}

export async function getCurrentUser(): Promise<StoredUser | null> {
  const db = getAuthDb();
  const sess = await db.session.get('current');
  if (!sess) return null;
  const user = await db.users.where('email').equals(sess.email).first();
  return user || null;
}

export async function getCurrentEmail(): Promise<string | null> {
  const db = getAuthDb();
  const sess = await db.session.get('current');
  return sess?.email || null;
}

export async function logoutUser(): Promise<void> {
  const db = getAuthDb();
  await db.session.delete('current');
  setEmailCache(null);
}

export async function isLoggedIn(): Promise<boolean> {
  const db = getAuthDb();
  const sess = await db.session.get('current');
  if (sess) {
    setEmailCache(sess.email);
    return true;
  }
  setEmailCache(null);
  return false;
}

export function getStoredEmail(): string | null {
  return null;
}

export function setStoredEmail(_email: string): void {}

export function getStoredPin(): string | null {
  return null;
}

export function setStoredPin(_pin: string): void {}

export async function getOwnerName(): Promise<string> {
  const user = await getCurrentUser();
  return user?.ownerName || '';
}

export async function setOwnerName(name: string): Promise<void> {
  const db = getAuthDb();
  const sess = await db.session.get('current');
  if (!sess) return;
  const user = await db.users.where('email').equals(sess.email).first();
  if (user && user.id) {
    await db.users.update(user.id, { ownerName: name });
  }
}

export function setWorkerSession(session: WorkerSession): void {
  localStorage.setItem(WORKER_SESSION_KEY, JSON.stringify(session));
}

export function getWorkerSession(): WorkerSession | null {
  const raw = localStorage.getItem(WORKER_SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function isWorkerLoggedIn(): boolean {
  return !!localStorage.getItem(WORKER_SESSION_KEY);
}

export function logoutWorker(): void {
  localStorage.removeItem(WORKER_SESSION_KEY);
}
