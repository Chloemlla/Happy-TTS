import React from 'react';

interface ServerStatus {
  uptime: number;
  memory_usage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu_usage_percent: number;
  platform: string;
  arch: string;
  node_version: string;
  pid?: number;
  startTime?: number;
  version?: string;
  versions?: any;
}

declare const ResourceAnalysisPanel: React.FC<{
  serverStatus: ServerStatus | null;
  resourceHistory: Array<{ timestamp: Date; memoryUsage: number; cpuUsage: number }>;
  autoRefresh: boolean;
}>;

export default ResourceAnalysisPanel; 