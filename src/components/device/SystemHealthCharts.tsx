import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

interface GaugeProps {
  label: string;
  value: number | null;
  unit: string;
  max?: number;
  thresholds?: { warning: number; danger: number };
}

const SystemGauge: React.FC<GaugeProps> = ({
  label,
  value,
  unit,
  max = 100,
  thresholds = { warning: 70, danger: 85 },
}) => {
  const safeValue = value ?? 0;
  const remaining = max - safeValue;

  const getColor = () => {
    if (safeValue >= thresholds.danger) return '#ef4444';
    if (safeValue >= thresholds.warning) return '#f59e0b';
    return '#22c55e';
  };

  const data = {
    datasets: [
      {
        data: [safeValue, remaining],
        backgroundColor: [getColor(), '#1e293b'],
        borderWidth: 0,
        borderRadius: 8,
        cutout: '80%',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    rotation: -90,
    circumference: 180,
  };

  return (
    <div className="glass-card p-4 flex flex-col items-center">
      <div className="relative w-32 h-16 overflow-hidden">
        <Doughnut data={data} options={options} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
          <p className="text-xl font-bold text-white">
            {value !== null ? value : '—'}
            <span className="text-xs text-surface-400 ml-0.5">{unit}</span>
          </p>
        </div>
      </div>
      <p className="text-xs text-surface-400 mt-2 font-medium uppercase tracking-wider">{label}</p>
    </div>
  );
};

interface SystemHealthChartsProps {
  cpu: number | null;
  ram: number | null;
  disk: number | null;
  temp: number | null;
}

const SystemHealthCharts: React.FC<SystemHealthChartsProps> = ({ cpu, ram, disk, temp }) => {
  return (
    <div>
      <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider mb-4">
        System Health
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SystemGauge label="CPU Usage" value={cpu} unit="%" />
        <SystemGauge label="RAM Usage" value={ram} unit="%" />
        <SystemGauge label="Disk Usage" value={disk} unit="%" />
        <SystemGauge
          label="Temperature"
          value={temp}
          unit="°C"
          max={100}
          thresholds={{ warning: 60, danger: 75 }}
        />
      </div>
    </div>
  );
};

export default SystemHealthCharts;
