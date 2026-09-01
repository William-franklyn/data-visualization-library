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

// --- shared stats helpers ----------------------------------------------------

function quantile(sortedArr, q) {
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }
  return sortedArr[base];
}

// IQR method: robust to non-normal distributions and small sample sizes.
function detectOutliers(nums, labels) {
  const sorted = [...nums].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;
  const outliers = [];
  nums.forEach((v, i) => {
    if (v < lowerBound || v > upperBound) {
      outliers.push({ index: i, label: labels[i], value: v, direction: v < lowerBound ? 'low' : 'high' });
    }
  });
  return outliers;
}

function pearsonCorrelation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const xs = a.slice(0, n);
  const ys = b.slice(0, n);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null; // a constant series has no defined correlation
  return num / Math.sqrt(denX * denY);
}

function correlationStrength(r) {
  const abs = Math.abs(r);
  const strength = abs >= 0.7 ? 'strong' : abs >= 0.4 ? 'moderate' : abs >= 0.2 ? 'weak' : 'negligible';
  return `${strength} ${r >= 0 ? 'positive' : 'negative'}`;
}

// Ordinary least-squares fit over the series' point index (0, 1, 2, ...).
function linearRegression(values) {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - meanY) ** 2;
  }
  const rSquared = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

function fitQualityLabel(rSquared) {
  if (rSquared >= 0.7) return 'high';
  if (rSquared >= 0.4) return 'moderate';
  return 'low';
}

// If the labels look like an arithmetic sequence of numbers (years, indices, ...)
// continue that sequence; otherwise fall back to generic "Forecast N" labels.
function deriveFutureLabels(labels, periods) {
  const n = labels.length;
  const last = Number(labels[n - 1]);
  const secondLast = Number(labels[n - 2]);
  if (n >= 2 && !Number.isNaN(last) && !Number.isNaN(secondLast)) {
    const step = last - secondLast;
    return Array.from({ length: periods }, (_, i) => String(last + step * (i + 1)));
  }
  return Array.from({ length: periods }, (_, i) => `Forecast ${i + 1}`);
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

function buildForecastOverlay(chartType, labels, datasetsData, names, periods) {
  const forecast = forecastTrend(labels, datasetsData, names, periods);
  const futureLabels = forecast.futureLabels;

  return { futureLabels, seriesForecasts: forecast.series };
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

  if (options.forecastPeriods && !isXY) {
    throw new Error('forecastPeriods is only supported for bar and line charts');
  }

  let datasets = datasetsData.map((values, i) => {
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

  let finalLabels = labels;

  if (options.forecastPeriods) {
    const { futureLabels, seriesForecasts } = buildForecastOverlay(chartType, labels, datasetsData, names, options.forecastPeriods);
    finalLabels = [...labels, ...futureLabels];

    datasets = datasets.flatMap((ds, i) => {
      const historyPad = new Array(options.forecastPeriods).fill(null);
      const actual = { ...ds, data: [...ds.data, ...historyPad] };

      const projectedValues = seriesForecasts[i].projected.map((p) => p.value);
      const forecastLeadIn = new Array(Math.max(ds.data.length - 1, 0)).fill(null);
      const forecastData = [...forecastLeadIn, ds.data[ds.data.length - 1], ...projectedValues];

      const overlay = {
        label: `${ds.label} (forecast)`,
        data: forecastData,
        borderColor: ds.borderColor,
        backgroundColor: 'transparent',
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 2,
        fill: false,
        tension: chartType === 'line' ? 0.35 : 0,
      };
      // Force the overlay to render as a line even when the base chart is bars,
      // so the trend projection reads as a dashed line over the bars.
      if (chartType === 'bar') overlay.type = 'line';

      return [actual, overlay];
    });
  }

  return {
    type: chartType,
    data: { labels: finalLabels, datasets },
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
  const numericSeries = valuesArray.map((values) => values.map(Number));

  const perSeries = numericSeries.map((nums, i) => {
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
      outliers: detectOutliers(nums, labels),
    };
  });

  const correlations = [];
  for (let i = 0; i < numericSeries.length; i++) {
    for (let j = i + 1; j < numericSeries.length; j++) {
      const r = pearsonCorrelation(numericSeries[i], numericSeries[j]);
      if (r !== null) {
        correlations.push({
          seriesA: names[i],
          seriesB: names[j],
          r: Math.round(r * 1000) / 1000,
          strength: correlationStrength(r),
        });
      }
    }
  }

  return { series: perSeries, correlations };
}

// --- forecast_trend ----------------------------------------------------------

function forecastTrend(labels, series, seriesLabels, periods = 3) {
  if (!Array.isArray(labels) || labels.length < 2) {
    throw new Error('labels must have at least 2 points to forecast a trend');
  }
  if (!Number.isInteger(periods) || periods < 1 || periods > 24) {
    throw new Error('periods must be an integer between 1 and 24');
  }

  const valuesArray = normalizeSeries(series);
  const names = normalizeSeriesLabels(seriesLabels, valuesArray.length);
  const futureLabels = deriveFutureLabels(labels, periods);

  const seriesForecasts = valuesArray.map((values, i) => {
    const nums = values.map(Number);
    if (nums.length < 2) {
      throw new Error(`Series "${names[i]}" needs at least 2 points to forecast a trend`);
    }
    const { slope, intercept, rSquared } = linearRegression(nums);
    const projected = futureLabels.map((label, idx) => {
      const x = nums.length + idx;
      return { label, value: Math.round((slope * x + intercept) * 100) / 100 };
    });

    return {
      series: names[i],
      trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'flat',
      slopePerPeriod: Math.round(slope * 100) / 100,
      rSquared: Math.round(rSquared * 1000) / 1000,
      fitQuality: fitQualityLabel(rSquared),
      projected,
    };
  });

  return {
    method: 'linear-regression (ordinary least squares over the point index)',
    periods,
    futureLabels,
    series: seriesForecasts,
  };
}

module.exports = {
  CHART_TYPES,
  THEMES,
  parseCsv,
  columnsToSeries,
  buildChart,
  analyzeData,
  forecastTrend,
};
