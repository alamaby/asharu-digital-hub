'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { useAdminTheme } from '@/components/admin/shell/AdminThemeContext';
import { buildTrendOptions } from './chart-options';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

export interface TrendPoint {
  hari: string;
  draf: number;
  disetujui: number;
}

interface AdminTrendChartProps {
  days: TrendPoint[];
  draftsLabel: string;
  approvedLabel: string;
  chartLabel: string;
}

/**
 * Area-chart tren draf (ApexCharts, client-only agar tidak masuk bundle SSR).
 * Ringkasan sr-only menjaga aksesibilitas pembaca layar.
 */
export function AdminTrendChart({ days, draftsLabel, approvedLabel, chartLabel }: AdminTrendChartProps) {
  const { theme } = useAdminTheme();
  const dark = theme === 'dark';

  const { options, series } = useMemo(() => {
    const categories = days.map((d) => d.hari.slice(5));
    const options: ApexOptions = {
      ...buildTrendOptions(categories, dark),
      xaxis: { ...(buildTrendOptions(categories, dark).xaxis ?? {}), categories }
    };
    return {
      options,
      series: [
        { name: draftsLabel, data: days.map((d) => d.draf) },
        { name: approvedLabel, data: days.map((d) => d.disetujui) }
      ]
    };
  }, [days, dark, draftsLabel, approvedLabel]);

  const total = days.reduce((acc, d) => acc + d.draf, 0);

  return (
    <div role="img" aria-label={`${chartLabel}: ${total} ${draftsLabel}`}>
      <ApexChart options={options} series={series} type="area" height={260} />
      <ul className="sr-only">
        {days.map((d) => (
          <li key={d.hari}>
            {d.hari}: {d.draf} {draftsLabel}, {d.disetujui} {approvedLabel}
          </li>
        ))}
      </ul>
    </div>
  );
}
