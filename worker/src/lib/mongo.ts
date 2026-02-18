/**
 * MongoDB Atlas Data API 客户端
 * 替代 mongoose，通过 HTTP 调用 MongoDB Atlas Data API
 * 文档: https://www.mongodb.com/docs/atlas/app-services/data-api/
 */
import type { Env } from '../types';

interface DataAPIRequest {
  dataSource?: string;
  database?: string;
  collection: string;
  filter?: Record<string, any>;
  projection?: Record<string, any>;
  sort?: Record<string, any>;
  limit?: number;
  skip?: number;
  document?: Record<string, any>;
  documents?: Record<string, any>[];
  update?: Record<string, any>;
  upsert?: boolean;
  pipeline?: Record<string, any>[];
}

interface DataAPIResponse<T = any> {
  document?: T;
  documents?: T[];
  insertedId?: string;
  insertedIds?: string[];
  matchedCount?: number;
  modifiedCount?: number;
  deletedCount?: number;
  upsertedId?: string;
}

export class MongoClient {
  private apiUrl: string;
  private apiKey: string;
  private dataSource: string;
  private database: string;

  constructor(env: Env, database = 'tts', dataSource = 'Cluster0') {
    this.apiUrl = env.MONGO_DATA_API_URL;
    this.apiKey = env.MONGO_DATA_API_KEY;
    this.dataSource = dataSource;
    this.database = database;
  }

  private async request<T = any>(action: string, body: DataAPIRequest): Promise<DataAPIResponse<T>> {
    const url = `${this.apiUrl}/action/${action}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({
        dataSource: this.dataSource,
        database: this.database,
        ...body,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MongoDB Data API error (${res.status}): ${text}`);
    }

    return res.json();
  }

  collection(name: string) {
    return new Collection(this, name);
  }

  /** 内部方法，供 Collection 调用 */
  _request<T = any>(action: string, body: DataAPIRequest) {
    return this.request<T>(action, body);
  }
}

export class Collection<T = any> {
  constructor(private client: MongoClient, private name: string) {}

  async findOne(filter: Record<string, any>, projection?: Record<string, any>): Promise<T | null> {
    const res = await this.client._request<T>('findOne', {
      collection: this.name,
      filter,
      projection,
    });
    return res.document ?? null;
  }

  async find(
    filter: Record<string, any>,
    options?: { projection?: Record<string, any>; sort?: Record<string, any>; limit?: number; skip?: number }
  ): Promise<T[]> {
    const res = await this.client._request<T>('find', {
      collection: this.name,
      filter,
      ...options,
    });
    return res.documents ?? [];
  }

  async insertOne(document: Partial<T>): Promise<string> {
    const res = await this.client._request('insertOne', {
      collection: this.name,
      document: document as Record<string, any>,
    });
    return res.insertedId!;
  }

  async insertMany(documents: Partial<T>[]): Promise<string[]> {
    const res = await this.client._request('insertMany', {
      collection: this.name,
      documents: documents as Record<string, any>[],
    });
    return res.insertedIds ?? [];
  }

  async updateOne(filter: Record<string, any>, update: Record<string, any>, upsert = false) {
    return this.client._request('updateOne', {
      collection: this.name,
      filter,
      update,
      upsert,
    });
  }

  async updateMany(filter: Record<string, any>, update: Record<string, any>) {
    return this.client._request('updateMany', {
      collection: this.name,
      filter,
      update,
    });
  }

  async deleteOne(filter: Record<string, any>) {
    return this.client._request('deleteOne', {
      collection: this.name,
      filter,
    });
  }

  async deleteMany(filter: Record<string, any>) {
    return this.client._request('deleteMany', {
      collection: this.name,
      filter,
    });
  }

  async countDocuments(filter: Record<string, any> = {}) {
    // Data API 没有直接的 count，用 aggregate
    const res = await this.client._request('aggregate', {
      collection: this.name,
      pipeline: [{ $match: filter }, { $count: 'count' }],
    });
    const docs = res.documents as any[];
    return docs?.[0]?.count ?? 0;
  }

  async aggregate<R = any>(pipeline: Record<string, any>[]): Promise<R[]> {
    const res = await this.client._request<R>('aggregate', {
      collection: this.name,
      pipeline,
    });
    return res.documents ?? [];
  }
}
