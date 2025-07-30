import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ResourceTrendChartProps {
  resourceHistory: Array<{ timestamp: Date; memoryUsage: number; cpuUsage: number }>;
  autoRefresh: boolean;
}

const ResourceTrendChart: React.FC<ResourceTrendChartProps> = ({ resourceHistory, autoRefresh }) => {
  const getChartData = () => {
    if (resourceHistory.length === 0) {
      return { labels: [], datasets: [] };
    }
    const labels = resourceHistory.map(item =>
      item.timestamp.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    );
    return {
      labels,
      datasets: [
        {
          label: '内存使用率 (%)',
          data: resourceHistory.map(item => item.memoryUsage),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y'
        },
        {
          label: 'CPU使用率 (%)',
          data: resourceHistory.map(item => item.cpuUsage),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'y'
        }
      ]
    };
  };

  const getChartOptions = () => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          padding: 20
        }
      },
      title: {
        display: true,
        text: '系统资源使用趋势图'
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        displayColors: true
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: '时间'
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: '使用率 (%)'
        },
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        },
        ticks: {
          callback: (value: any) => `${value}%`
        }
      }
    }
  });

  if (resourceHistory.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <span>暂无数据，请开启自动刷新或手动刷新获取数据</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-80">
      <Line data={getChartData()} options={getChartOptions()} />
    </div>
  );
};

export default ResourceTrendChart; 