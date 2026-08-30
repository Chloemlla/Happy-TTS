import { api } from './api';

export type CoinFlipResult = 'heads' | 'tails';

export interface CoinFlipRecord {
  resultId: string;
  result: CoinFlipResult;
  userId?: string;
  username?: string;
  createdAt: string;
}

export interface CoinFlipListPage {
  items: CoinFlipRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CoinFlipStatistics {
  total: number;
  heads: number;
  tails: number;
  headsRatio: number;
}

const BASE = '/api/coin-flip';

export const coinFlipApi = {
  flip: async (): Promise<CoinFlipRecord> => {
    const res = await api.post(`${BASE}/flip`);
    return res.data.data as CoinFlipRecord;
  },

  getResult: async (resultId: string): Promise<CoinFlipRecord> => {
    const res = await api.get(`${BASE}/results/${encodeURIComponent(resultId)}`);
    return res.data.data as CoinFlipRecord;
  },

  listResults: async (page = 1, pageSize = 20): Promise<CoinFlipListPage> => {
    const res = await api.get(`${BASE}/results`, { params: { page, pageSize } });
    return res.data.data as CoinFlipListPage;
  },

  getStatistics: async (): Promise<CoinFlipStatistics> => {
    const res = await api.get(`${BASE}/statistics`);
    return res.data.data as CoinFlipStatistics;
  },
};
