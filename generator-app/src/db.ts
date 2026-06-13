import Dexie, { type Table } from 'dexie';

const CURRENT_USER_CACHE = 'generator_app_current_user';

export interface Generator {
  id?: number;
  name: string;
}

export interface Subscriber {
  id?: number;
  name: string;
  ampere: number;
  generatorId: number;
  startMonth: number;
  startYear: number;
  active: boolean;
}

export interface AmpereHistory {
  id?: number;
  subscriberId: number;
  ampere: number;
  effectiveMonth: number;
  effectiveYear: number;
}

export interface Payment {
  id?: number;
  subscriberId: number;
  month: number;
  year: number;
  pricePerAmpere: number;
  paid: boolean;
  paidAt?: string;
}

export interface AmperePrice {
  id?: number;
  month: number;
  year: number;
  price: number;
  generatorId: number;
}

export interface Expense {
  id?: number;
  month: number;
  year: number;
  fuel: number;
  oil: number;
  maintenance: number;
  generatorId: number;
}

export interface WorkerCredential {
  id?: number;
  generatorId: number;
  generatorName: string;
  code: string;
  password: string;
  ownerEmail?: string;
}

export interface WorkerPendingChange {
  id?: number;
  workerCode: string;
  generatorName: string;
  changes: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

class GeneratorDB extends Dexie {
  generators!: Table<Generator>;
  subscribers!: Table<Subscriber>;
  ampereHistory!: Table<AmpereHistory>;
  payments!: Table<Payment>;
  amperePrices!: Table<AmperePrice>;
  expenses!: Table<Expense>;
  workerCredentials!: Table<WorkerCredential>;
  workerPendingChanges!: Table<WorkerPendingChange>;

  constructor(dbName: string) {
    super(dbName);
    this.version(8).stores({
      generators: '++id, name',
      subscribers: '++id, name, ampere, generatorId, startMonth, startYear, active',
      payments: '++id, subscriberId, [subscriberId+month+year], month, year',
      ampereHistory: '++id, subscriberId, [subscriberId+effectiveYear+effectiveMonth]',
      amperePrices: '++id, [month+year+generatorId]',
      expenses: '++id, [month+year+generatorId]',
      workerCredentials: '++id, generatorId, code',
      workerPendingChanges: '++id, workerCode, status',
    });
  }
}

let currentDb: GeneratorDB | null = null;

function getDbName(): string {
  const email = localStorage.getItem(CURRENT_USER_CACHE);
  if (!email) return 'GeneratorDB_default';
  return 'GenDB_' + email.replace(/[^a-zA-Z0-9]/g, '_');
}

export function setEmailCache(email: string | null): void {
  if (email) {
    localStorage.setItem(CURRENT_USER_CACHE, email);
  } else {
    localStorage.removeItem(CURRENT_USER_CACHE);
  }
}

export function getEmailCache(): string | null {
  return localStorage.getItem(CURRENT_USER_CACHE);
}

export function getDb(): GeneratorDB {
  const dbName = getDbName();
  if (!currentDb || currentDb.name !== dbName) {
    if (currentDb) {
      currentDb.close();
    }
    currentDb = new GeneratorDB(dbName);
  }
  return currentDb;
}

export function resetDb(): void {
  if (currentDb) {
    currentDb.close();
    currentDb = null;
  }
}

let workerDb: GeneratorDB | null = null;

export function getWorkerDb(ownerEmail?: string): GeneratorDB {
  if (!ownerEmail) return getDb();
  const dbName = 'GenDB_' + ownerEmail.replace(/[^a-zA-Z0-9]/g, '_');
  if (!workerDb || workerDb.name !== dbName) {
    if (workerDb) workerDb.close();
    workerDb = new GeneratorDB(dbName);
  }
  return workerDb;
}

export function resetWorkerDb(): void {
  if (workerDb) {
    workerDb.close();
    workerDb = null;
  }
}

export function generateWorkerCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MOLD-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const WORKER_CREDS_KEY = 'generator_app_worker_creds';

export function saveWorkerCredentialGlobal(cred: WorkerCredential): void {
  const raw = localStorage.getItem(WORKER_CREDS_KEY);
  const all: Record<string, WorkerCredential> = raw ? JSON.parse(raw) : {};
  all[cred.code] = cred;
  localStorage.setItem(WORKER_CREDS_KEY, JSON.stringify(all));
}

export function removeWorkerCredentialGlobal(code: string): void {
  const raw = localStorage.getItem(WORKER_CREDS_KEY);
  if (!raw) return;
  const all: Record<string, WorkerCredential> = JSON.parse(raw);
  delete all[code];
  localStorage.setItem(WORKER_CREDS_KEY, JSON.stringify(all));
}

export function verifyWorkerGlobal(code: string, password: string): WorkerCredential | null {
  const raw = localStorage.getItem(WORKER_CREDS_KEY);
  if (!raw) return null;
  const all: Record<string, WorkerCredential> = JSON.parse(raw);
  const cred = all[code.toUpperCase().trim()];
  if (!cred || cred.password !== password) return null;
  return cred;
}

export function getAllWorkerCredentials(): WorkerCredential[] {
  const raw = localStorage.getItem(WORKER_CREDS_KEY);
  if (!raw) return [];
  const all: Record<string, WorkerCredential> = JSON.parse(raw);
  return Object.values(all);
}

export async function verifyWorker(code: string, password: string): Promise<WorkerCredential | null> {
  return verifyWorkerGlobal(code, password);
}

export async function getWorkerCredentialsForGenerator(generatorId: number): Promise<WorkerCredential | undefined> {
  const db = getDb();
  const localCred = await db.workerCredentials.where('generatorId').equals(generatorId).first();
  if (localCred) return localCred;
  const all = getAllWorkerCredentials();
  return all.find(c => c.generatorId === generatorId);
}

export async function setWorkerCredential(generatorId: number, generatorName: string, password: string): Promise<WorkerCredential> {
  const db = getDb();
  const ownerEmail = getEmailCache() || undefined;
  const existing = await db.workerCredentials.where('generatorId').equals(generatorId).first();
  if (existing) {
    await db.workerCredentials.update(existing.id!, { password, generatorName, ownerEmail });
    const updated = { ...existing, password, generatorName, ownerEmail };
    saveWorkerCredentialGlobal(updated);
    return updated;
  }
  const code = generateWorkerCode();
  const cred: WorkerCredential = { generatorId, generatorName, code, password, ownerEmail };
  const id = await db.workerCredentials.add(cred);
  const fullCred = { ...cred, id };
  saveWorkerCredentialGlobal(fullCred);
  return fullCred;
}

export async function addPendingChange(workerCode: string, generatorName: string, changes: any[]): Promise<void> {
  const db = getDb();
  await db.workerPendingChanges.add({
    workerCode,
    generatorName,
    changes: JSON.stringify(changes),
    createdAt: new Date().toISOString(),
    status: 'pending',
  });
}

export async function getPendingChanges(): Promise<WorkerPendingChange[]> {
  const db = getDb();
  return db.workerPendingChanges.where('status').equals('pending').toArray();
}

export async function updateChangeStatus(id: number, status: 'approved' | 'rejected'): Promise<void> {
  const db = getDb();
  await db.workerPendingChanges.update(id, { status });
}

export async function getAmpereForMonth(subscriberId: number, month: number, year: number): Promise<number> {
  const db = getDb();
  const sub = await db.subscribers.get(subscriberId);
  if (!sub) return 0;

  const history = await db.ampereHistory
    .where('subscriberId')
    .equals(subscriberId)
    .and(h => h.effectiveYear < year || (h.effectiveYear === year && h.effectiveMonth <= month))
    .reverse()
    .sortBy('effectiveYear');

  if (history.length > 0) {
    const latest = history.sort((a, b) => {
      if (b.effectiveYear !== a.effectiveYear) return b.effectiveYear - a.effectiveYear;
      return b.effectiveMonth - a.effectiveMonth;
    })[0];
    return latest.ampere;
  }

  return sub.ampere;
}

export async function getPriceForMonth(month: number, year: number, generatorId: number): Promise<number> {
  const db = getDb();
  const record = await db.amperePrices
    .where('[month+year+generatorId]')
    .equals([month, year, generatorId])
    .first();
  return record?.price ?? 0;
}

export async function setPriceForMonth(month: number, year: number, price: number, generatorId: number): Promise<void> {
  const db = getDb();
  const existing = await db.amperePrices
    .where('[month+year+generatorId]')
    .equals([month, year, generatorId])
    .first();
  if (existing) {
    await db.amperePrices.update(existing.id!, { price });
  } else {
    await db.amperePrices.add({ month, year, price, generatorId });
  }
}

export async function getExpensesForMonth(month: number, year: number, generatorId: number): Promise<Expense> {
  const db = getDb();
  const record = await db.expenses
    .where('[month+year+generatorId]')
    .equals([month, year, generatorId])
    .first();
  return record || { month, year, fuel: 0, oil: 0, maintenance: 0, generatorId };
}

export async function setExpensesForMonth(month: number, year: number, fuel: number, oil: number, maintenance: number, generatorId: number): Promise<void> {
  const db = getDb();
  const existing = await db.expenses
    .where('[month+year+generatorId]')
    .equals([month, year, generatorId])
    .first();
  if (existing) {
    await db.expenses.update(existing.id!, { fuel, oil, maintenance });
  } else {
    await db.expenses.add({ month, year, fuel, oil, maintenance, generatorId });
  }
}
