export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  dailyUsage: number;
  lastUsageDate: string;
  createdAt: string;
  remainingUsage?: number;
} 