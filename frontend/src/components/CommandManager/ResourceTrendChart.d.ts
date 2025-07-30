import React from 'react';

declare const ResourceTrendChart: React.FC<{
  resourceHistory: Array<{ timestamp: Date; memoryUsage: number; cpuUsage: number }>;
  autoRefresh: boolean;
}>;

export default ResourceTrendChart; 