'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useAdminTheme } from '@/components/admin/shell/AdminThemeContext';
import { buildFunnelOptions } from './chart-options';
import type { FunnelRow } from '@/components/admin/DashboardCards';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface AdminFunnelChartProps {
  rows: FunnelRow[];
  chartLabel: string;
}

/** Donut funnel status riset (ApexCharts, client-only). */
export function AdminFunnelChart({ rows, chartLabel }: AdminFunnelChartProps) {
  const { theme } = useAdminTheme();
  const dark = theme === 'dark';

  const { options, series } = useMemo(
    () => ({
      options: buildFunnelOptions(
        rows.map((r) => r.status),
        dark
      ),
      series: rows.map((r) => r.jumlah)
    }),
    [rows, dark]
  );

  const total = rows.reduce((acc, r) => acc + r.jumlah, 0);

  return (
    <div role="img" aria-label={`${chartLabel}: ${total}`}>
      <ApexChart options={options} series={series} type="donut" height={260} />
      <ul className="sr-only">
        {rows.map((r) => (
          <li key={r.status}>
            {r.status}: {r.jumlah}
          </li>
        ))}
      </ul>
    </div>
  );
}
