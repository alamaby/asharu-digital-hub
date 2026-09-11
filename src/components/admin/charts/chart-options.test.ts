import { describe, expect, it } from 'vitest';
import { buildFunnelOptions, buildTrendOptions } from './chart-options';

describe('chart options', () => {
  it('trend options carry categories and brand palette', () => {
    const options = buildTrendOptions(['09-01', '09-02'], false);
    expect(options.chart?.type).toBe('area');
    expect(options.xaxis && 'categories' in options.xaxis ? options.xaxis.categories : []).toEqual([
      '09-01',
      '09-02'
    ]);
    expect(options.colors).toEqual(['#465fff', '#12b76a']);
    expect(options.theme?.mode).toBe('light');
  });

  it('trend options switch grid and theme in dark mode', () => {
    const options = buildTrendOptions(['09-01'], true);
    expect(options.theme?.mode).toBe('dark');
    expect(options.grid?.borderColor).toBe('#1d2939');
  });

  it('funnel options map labels to palette in order', () => {
    const options = buildFunnelOptions(['completed', 'awaiting_selection'], false);
    expect(options.chart?.type).toBe('donut');
    expect(options.labels).toEqual(['completed', 'awaiting_selection']);
    expect(options.colors?.length).toBe(2);
  });
});
