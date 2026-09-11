import type { ApexOptions } from 'apexcharts';

export const ADMIN_CHART_COLORS = {
  brand: '#465fff',
  success: '#12b76a',
  warning: '#f79009',
  error: '#f04438',
  info: '#0ba5ec',
  neutral: '#98a2b3',
  gridLight: '#e4e7ec',
  gridDark: '#1d2939',
  textLight: '#475467',
  textDark: '#98a2b3'
} as const;

const FUNNEL_PALETTE = [
  ADMIN_CHART_COLORS.brand,
  ADMIN_CHART_COLORS.warning,
  ADMIN_CHART_COLORS.success,
  ADMIN_CHART_COLORS.info,
  ADMIN_CHART_COLORS.error,
  ADMIN_CHART_COLORS.neutral
];

/** Opsi area-chart tren (murni, unit-testable). `dark` mengganti grid/teks. */
export function buildTrendOptions(categories: string[], dark: boolean): ApexOptions {
  return {
    chart: { type: 'area', toolbar: { show: false }, zoom: { enabled: false }, fontFamily: 'inherit' },
    theme: { mode: dark ? 'dark' : 'light' },
    colors: [ADMIN_CHART_COLORS.brand, ADMIN_CHART_COLORS.success],
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.05 } },
    grid: { borderColor: dark ? ADMIN_CHART_COLORS.gridDark : ADMIN_CHART_COLORS.gridLight },
    xaxis: {
      categories,
      labels: { style: { colors: dark ? ADMIN_CHART_COLORS.textDark : ADMIN_CHART_COLORS.textLight } }
    },
    yaxis: {
      labels: { style: { colors: dark ? ADMIN_CHART_COLORS.textDark : ADMIN_CHART_COLORS.textLight } }
    },
    legend: { position: 'top', horizontalAlign: 'right' },
    tooltip: { theme: dark ? 'dark' : 'light' }
  };
}

/** Opsi donut funnel (murni, unit-testable). */
export function buildFunnelOptions(labels: string[], dark: boolean): ApexOptions {
  return {
    chart: { type: 'donut', fontFamily: 'inherit' },
    theme: { mode: dark ? 'dark' : 'light' },
    colors: labels.map((_, i) => FUNNEL_PALETTE[i % FUNNEL_PALETTE.length]),
    labels,
    legend: { position: 'bottom' },
    dataLabels: { enabled: true },
    tooltip: { theme: dark ? 'dark' : 'light' },
    stroke: { width: 0 }
  };
}
