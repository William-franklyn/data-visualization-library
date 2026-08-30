'use strict';

const Papa = require('papaparse');

const CHART_TYPES = ['bar', 'line', 'doughnut', 'polarArea'];

const THEMES = {
  teal: { s: ['rgba(75,192,192,0.75)', 'rgba(75,192,192,1)'], m: [[75, 192, 192], [54, 162, 235], [255, 206, 86], [255, 99, 132], [153, 102, 255], [255, 159, 64], [201, 203, 207]] },
  fire: { s: ['rgba(232,82,26,0.75)', 'rgba(232,82,26,1)'], m: [[232, 82, 26], [249, 115, 22], [251, 191, 36], [239, 68, 68], [234, 88, 12], [253, 224, 71], [220, 38, 38]] },
  ocean: { s: ['rgba(37,99,235,0.75)', 'rgba(37,99,235,1)'], m: [[37, 99, 235], [96, 165, 250], [14, 165, 233], [6, 182, 212], [99, 102, 241], [34, 211, 238], [59, 130, 246]] },
  grape: { s: ['rgba(124,58,237,0.75)', 'rgba(124,58,237,1)'], m: [[124, 58, 237], [167, 139, 250], [219, 39, 119], [244, 114, 182], [139, 92, 246], [196, 181, 253], [236, 72, 153]] },
  emerald: { s: ['rgba(5,150,105,0.75)', 'rgba(5,150,105,1)'], m: [[5, 150, 105], [52, 211, 153], [16, 185, 129], [6, 182, 212], [132, 204, 22], [34, 197, 94], [20, 184, 166]] },
  sunset: { s: ['rgba(251,113,133,0.75)', 'rgba(251,113,133,1)'], m: [[251, 113, 133], [251, 146, 60], [251, 191, 36], [250, 204, 21], [253, 224, 71], [252, 165, 165], [254, 215, 170]] },
};
const DEFAULT_THEME = 'teal';

function normalizeSeries(series) {
  if (!Array.isArray(series)) {
    throw new Error('series must be an array of numbers or an array of number arrays');
  }
  return Array.isArray(series[0]) ? series : [series];
}

function normalizeSeriesLabels(seriesLabels, count) {
  const labels = Array.isArray(seriesLabels) ? seriesLabels.slice() : [];
  while (labels.length < count) labels.push(`Series ${labels.length + 1}`);
  return labels;
}

// --- parse_csv -------------------------------------------------------------

function parseCsv(csvText, { maxRows = 1000, maxSampleRows = 5 } = {}) {
  if (typeof csvText !== 'string' || !csvText.trim()) {
    throw new Error('csvText must be a non-empty string');
  }

  const result = Papa.parse(csvText.trim(), { header: true, skipEmptyLines: true });
  if (result.errors && result.errors.length) {
    const fatal = result.errors.find((e) => e.type !== 'FieldMismatch');
    if (fatal) throw new Error(`CSV parse error: ${fatal.message}`);
  }

  const headers = result.meta.fields || [];
  if (!headers.length) throw new Error('CSV has no header row / columns');

  const rows = result.data.slice(0, maxRows);
  if (!rows.length) throw new Error('CSV has no data rows');

  const numericColumns = headers.filter((h) =>
    rows.every((r) => r[h] !== '' && r[h] != null && !isNaN(Number(r[h])))
  );

  const nonNumeric = headers.filter((h) => !numericColumns.includes(h));
  const suggestedLabelColumn = nonNumeric[0] || headers[0];
  const suggestedDataColumns = numericColumns.length ? numericColumns : headers.slice(1, 2);

  return {
    headers,
    rowCount: result.data.length,
    truncated: result.data.length > rows.length,
    sampleRows: rows.slice(0, maxSampleRows),
    numericColumns,
    suggestedLabelColumn,
    suggestedDataColumns,
    rows,
  };
}

function columnsToSeries(rows, labelColumn, dataColumns) {
  const labels = rows.map((r) => String(r[labelColumn] ?? 'Data'));
  const series = dataColumns.map((col) => rows.map((r) => Number(r[col])));
  return { labels, series, seriesLabels: dataColumns };
}

// --- create_chart ------------------------------------------------------------

function generateHueSpread(count, startHue = 0) {
  const bg = [];
  const border = [];
  for (let i = 0; i < count; i++) {
    const h = Math.round((startHue + (i / count) * 360) % 360);
    bg.push(`hsla(${h},80%,58%,0.78)`);
    border.push(`hsl(${h},80%,44%)`);
  }
  return { bg, border };
}

function getColors(theme, chartType, count) {
  const isXY = chartType === 'bar' || chartType === 'line';
  if (isXY) return { bg: theme.s[0], border: theme.s[1] };
  if (!theme.m) return generateHueSpread(count);
  const bg = [];
  const border = [];
  for (let i = 0; i < count; i++) {
    const [r, g, b] = theme.m[i % theme.m.length];
    bg.push(`rgba(${r},${g},${b},0.78)`);
    border.push(`rgba(${r},${g},${b},1)`);
  }
  return { bg, border };
}

function buildChart(chartType, labels, series, seriesLabels, options = {}) {
  if (!CHART_TYPES.includes(chartType)) {
    throw new Error(`chartType must be one of: ${CHART_TYPES.join(', ')}`);
  }
  if (!Array.isArray(labels) || !labels.length) {
    throw new Error('labels must be a non-empty array');
  }

  const valuesArray = normalizeSeries(series);
  const names = normalizeSeriesLabels(seriesLabels, valuesArray.length);
  const theme = THEMES[options.theme] || THEMES[DEFAULT_THEME];
  const isXY = chartType === 'bar' || chartType === 'line';
  const datasetsData = isXY ? valuesArray : [valuesArray[0]];

  const datasets = datasetsData.map((values, i) => {
    let bg;
    let border;
    if (datasetsData.length === 1) {
      const c = getColors(theme, chartType, values.length);
      bg = c.bg;
      border = c.border;
    } else {
      const palette = theme.m || [[75, 192, 192], [255, 99, 132], [255, 206, 86]];
      const [r, g, b] = palette[i % palette.length];
      bg = `rgba(${r},${g},${b},0.75)`;
      border = `rgba(${r},${g},${b},1)`;
    }
    const ds = { label: names[i], data: values, backgroundColor: bg, borderColor: border, borderWidth: 1.5 };
    if (chartType === 'line') {
      ds.tension = 0.35;
      ds.pointRadius = 3;
      ds.fill = false;
    }
    return ds;
  });

  return {
    type: chartType,
    data: { labels, datasets },
    options: {
      plugins: {
        title: options.title ? { display: true, text: options.title } : { display: false },
        legend: { display: true, position: 'top' },
      },
      scales: isXY
        ? {
            y: { beginAtZero: true, title: { display: !!options.yLabel, text: options.yLabel || '' } },
            x: { title: { display: !!options.xLabel, text: options.xLabel || '' } },
          }
        : {},
    },
  };
}

// --- analyze_data ------------------------------------------------------------

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function analyzeData(labels, series, seriesLabels) {
  if (!Array.isArray(labels) || !labels.length) {
    throw new Error('labels must be a non-empty array');
  }
  const valuesArray = normalizeSeries(series);
  const names = normalizeSeriesLabels(seriesLabels, valuesArray.length);

  return valuesArray.map((values, i) => {
    const nums = values.map(Number);
    const sorted = [...nums].sort((a, b) => a - b);
    const sum = nums.reduce((a, b) => a + b, 0);
    const maxIdx = nums.indexOf(Math.max(...nums));
    const minIdx = nums.indexOf(Math.min(...nums));
    const delta = nums[nums.length - 1] - nums[0];
    const trend = delta > 0 ? 'increasing' : delta < 0 ? 'decreasing' : 'flat';

    return {
      series: names[i],
      count: nums.length,
      sum,
      mean: sum / nums.length,
      median: median(sorted),
      max: { value: nums[maxIdx], label: labels[maxIdx] },
      min: { value: nums[minIdx], label: labels[minIdx] },
      trend,
      firstToLastDelta: delta,
    };
  });
}

module.exports = {
  CHART_TYPES,
  THEMES,
  parseCsv,
  columnsToSeries,
  buildChart,
  analyzeData,
};
