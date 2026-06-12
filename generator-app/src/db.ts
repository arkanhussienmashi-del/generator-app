import Dexie, { type Table } from 'dexie';

export interface Generator {
  id?: number;
  name: string;
}

export interface Subscriber {
  id?: number;
  name: string;
  ampere: number;
  generatorId: number;
}

export interface Payment {
  id?: number;
  subscriberId: number;
  month: number;
  year: number;
  pricePerAmpere: number;
  paid: boolean;
}

class GeneratorDB extends Dexie {
  generators!: Table<Generator>;
  subscribers!: Table<Subscriber>;
  payments!: Table<Payment>;

  constructor() {
    super('GeneratorDB');
    this.version(1).stores({
      generators: '++id, name',
      subscribers: '++id, name, ampere, generatorId',
      payments: '++id, subscriberId, [subscriberId+month+year], month, year',
    });
  }
}

export const db = new GeneratorDB();
