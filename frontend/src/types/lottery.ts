// 区块链数据类型
export interface BlockchainData {
  height: number;
  hash: string;
  timestamp: number;
  difficulty: number;
}

// 奖品类型
export interface LotteryPrize {
  id: string;
  name: string;
  description: string;
  value: number;
  probability: number;
  quantity: number;
  remaining: number;
  image?: string;
  category: 'common' | 'rare' | 'epic' | 'legendary';
}

// 抽奖轮次类型
export interface LotteryRound {
  id: string;
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  isActive: boolean;
  prizes: LotteryPrize[];
  participants: string[];
  winners: LotteryWinner[];
  blockchainHeight: number;
  seed: string;
}

// 中奖者类型
export interface LotteryWinner {
  userId: string;
  username: string;
  prizeId: string;
  prizeName: string;
  drawTime: number;
  transactionHash?: string;
}

// 用户抽奖记录类型
export interface UserLotteryRecord {
  userId: string;
  username: string;
  participationCount: number;
  winCount: number;
  lastDrawTime: number;
  totalValue: number;
  history: {
    roundId: string;
    prizeId: string;
    prizeName: string;
    drawTime: number;
    value: number;
  }[];
}

// 统计信息类型
export interface LotteryStatistics {
  totalRounds: number;
  activeRounds: number;
  totalParticipants: number;
  totalWinners: number;
  totalValue: number;
}

// API响应类型
export interface LotteryApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
} 