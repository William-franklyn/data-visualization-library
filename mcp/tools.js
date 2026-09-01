'use strict';

const Papa = require('papaparse');

const CHART_TYPES = ['bar', 'line', 'doughnut', 'polarArea'];
const FORECAST_METHODS = ['auto', 'linear', 'exponential-smoothing'];
const HORIZON_UNITS = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'];
const MAX_FORECAST_POINTS = 365;

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

function round2(x) {
  return Math.round(x * 100) / 100;
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
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

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// --- forecasting: shared fit metrics -----------------------------------------

function rSquaredOf(actual, predicted) {
  const mean = actual.reduce((s, v) => s + v, 0) / actual.length;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < actual.length; i++) {
    ssRes += (actual[i] - predicted[i]) ** 2;
    ssTot += (actual[i] - mean) ** 2;
  }
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot;
}

function meanAbsolutePercentageError(actual, predicted) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 0) continue; // undefined percentage error at zero — skip
    sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
    count++;
  }
  return count ? sum / count : 0;
}

function fitQualityLabel(rSquared) {
  if (rSquared >= 0.7) return 'high';
  if (rSquared >= 0.4) return 'moderate';
  return 'low';
}

// --- forecasting: method 1 — linear regression (straight-line trend) --------

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
  return { slope, intercept };
}

function linearForecastSeries(values, periods) {
  const { slope, intercept } = linearRegression(values);
  const fitted = values.map((_, i) => slope * i + intercept);
  const rSquared = rSquaredOf(values, fitted);
  const mape = meanAbsolutePercentageError(values, fitted);
  const projectedValues = Array.from({ length: periods }, (_, i) => round2(slope * (values.length + i) + intercept));
  return { method: 'linear', slope, rSquared, mape, projectedValues };
}

// --- forecasting: method 2 — Holt's linear exponential smoothing ------------
// Re-estimates the trend at every point, weighting recent movements more
// heavily than old ones — closer to "learning from previous movements" than
// a single fixed line. alpha/beta are grid-searched to minimize in-sample
// one-step-ahead error.

function runHolt(values, alpha, beta) {
  const n = values.length;
  const level = new Array(n);
  const trend = new Array(n);
  const fitted = new Array(n - 1); // one-step-ahead prediction for t = 1..n-1

  level[0] = values[0];
  trend[0] = values[1] - values[0];

  for (let t = 1; t < n; t++) {
    fitted[t - 1] = level[t - 1] + trend[t - 1];
    level[t] = alpha * values[t] + (1 - alpha) * (level[t - 1] + trend[t - 1]);
    trend[t] = beta * (level[t] - level[t - 1]) + (1 - beta) * trend[t - 1];
  }

  return { level, trend, fitted };
}

function fitHoltLinear(values) {
  const grid = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  let best = null;
  for (const alpha of grid) {
    for (const beta of grid) {
      const { level, trend, fitted } = runHolt(values, alpha, beta);
      let sse = 0;
      for (let i = 0; i < fitted.length; i++) sse += (values[i + 1] - fitted[i]) ** 2;
      if (!best || sse < best.sse) best = { alpha, beta, level, trend, fitted, sse };
    }
  }
  return best;
}

function holtForecastSeries(values, periods) {
  const { alpha, beta, level, trend, fitted } = fitHoltLinear(values);
  const actualTail = values.slice(1);
  const rSquared = rSquaredOf(actualTail, fitted);
  const mape = meanAbsolutePercentageError(actualTail, fitted);
  const lastLevel = level[level.length - 1];
  const lastTrend = trend[trend.length - 1];
  const projectedValues = Array.from({ length: periods }, (_, i) => round2(lastLevel + lastTrend * (i + 1)));
  return { method: 'exponential-smoothing', slope: lastTrend, rSquared, mape, projectedValues, alpha, beta };
}

function chooseForecastMethod(values, periods, method) {
  if (method === 'linear') return linearForecastSeries(values, periods);

  // Holt's needs a real trend to estimate from; below 3 points it's degenerate
  // (a perfect but meaningless fit), so fall back to linear regardless of what
  // was requested.
  if (values.length < 3) return linearForecastSeries(values, periods);

  if (method === 'exponential-smoothing') return holtForecastSeries(values, periods);

  // auto: fit both, report both, use whichever tracked the historical data
  // more closely (lower mean absolute percentage error).
  const linear = linearForecastSeries(values, periods);
  const holt = holtForecastSeries(values, periods);
  const winner = holt.mape < linear.mape ? holt : linear;
  return {
    ...winner,
    candidates: {
      linear: { rSquared: round3(linear.rSquared), mapePercent: round2(linear.mape * 100) },
      exponentialSmoothing: { rSquared: round3(holt.rSquared), mapePercent: round2(holt.mape * 100) },
    },
  };
}

// --- forecasting: labels — point count vs. real time horizons ---------------

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

const UNIT_MS = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  months: 30.4368 * 24 * 60 * 60 * 1000, // average Gregorian month
  years: 365.2425 * 24 * 60 * 60 * 1000, // average Gregorian year
};

function detectTimeSeries(labels) {
  const timestamps = labels.map((l) => {
    const t = Date.parse(l);
    return Number.isNaN(t) ? null : t;
  });
  if (timestamps.some((t) => t === null)) return null;

  const deltas = [];
  for (let i = 1; i < timestamps.length; i++) deltas.push(timestamps[i] - timestamps[i - 1]);
  if (deltas.some((d) => d <= 0)) return null; // must be strictly increasing to be a clean, evenly-ordered time series

  const sortedDeltas = [...deltas].sort((a, b) => a - b);
  const medianDeltaMs = sortedDeltas[Math.floor(sortedDeltas.length / 2)];
  return { timestamps, medianDeltaMs };
}

function formatTimestamp(ms, medianDeltaMs) {
  const iso = new Date(ms).toISOString();
  return medianDeltaMs >= UNIT_MS.days ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

function resolveHorizon(horizon, labels) {
  if (!HORIZON_UNITS.includes(horizon.unit)) {
    throw new Error(`horizon.unit must be one of: ${HORIZON_UNITS.join(', ')}`);
  }
  if (!(horizon.value > 0)) {
    throw new Error('horizon.value must be a positive number');
  }

  const timeSeries = detectTimeSeries(labels);
  if (!timeSeries) {
    throw new Error(
      'horizon requires labels that parse as dates/timestamps (e.g. "2024-01-01" or "2024-01-01T10:00:00Z"), in increasing order'
    );
  }

  const totalMs = horizon.value * UNIT_MS[horizon.unit];
  const periods = Math.min(MAX_FORECAST_POINTS, Math.max(1, Math.round(totalMs / timeSeries.medianDeltaMs)));
  const lastTs = timeSeries.timestamps[timeSeries.timestamps.length - 1];
  const futureLabels = Array.from({ length: periods }, (_, i) =>
    formatTimestamp(lastTs + timeSeries.medianDeltaMs * (i + 1), timeSeries.medianDeltaMs)
  );

  return {
    periods,
    futureLabels,
    info: { requested: horizon, detectedIntervalMs: timeSeries.medianDeltaMs, resolvedPeriods: periods },
  };
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
  const wantsForecast = options.forecastPeriods || options.forecastHorizon;

  if (wantsForecast && !isXY) {
    throw new Error('forecastPeriods/forecastHorizon is only supported for bar and line charts');
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

  if (wantsForecast) {
    const forecast = forecastTrend(labels, datasetsData, names, {
      periods: options.forecastPeriods,
      horizon: options.forecastHorizon,
      method: options.forecastMethod,
    });
    const periodCount = forecast.futureLabels.length;
    finalLabels = [...labels, ...forecast.futureLabels];

    datasets = datasets.flatMap((ds, i) => {
      const historyPad = new Array(periodCount).fill(null);
      const actual = { ...ds, data: [...ds.data, ...historyPad] };

      const projectedValues = forecast.series[i].projected.map((p) => p.value);
      const forecastLeadIn = new Array(Math.max(ds.data.length - 1, 0)).fill(null);
      const forecastData = [...forecastLeadIn, ds.data[ds.data.length - 1], ...projectedValues];

      const overlay = {
        label: `${ds.label} (forecast · ${forecast.series[i].method})`,
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
          r: round3(r),
          strength: correlationStrength(r),
        });
      }
    }
  }

  return { series: perSeries, correlations };
}

// --- forecast_trend ----------------------------------------------------------

function forecastTrend(labels, series, seriesLabels, options = {}) {
  const method = options.method || 'auto';
  if (!Array.isArray(labels) || labels.length < 2) {
    throw new Error('labels must have at least 2 points to forecast a trend');
  }
  if (!FORECAST_METHODS.includes(method)) {
    throw new Error(`method must be one of: ${FORECAST_METHODS.join(', ')}`);
  }

  const valuesArray = normalizeSeries(series);
  const names = normalizeSeriesLabels(seriesLabels, valuesArray.length);

  let periods;
  let futureLabels;
  let horizonInfo = null;

  if (options.horizon) {
    const resolved = resolveHorizon(options.horizon, labels);
    periods = resolved.periods;
    futureLabels = resolved.futureLabels;
    horizonInfo = resolved.info;
  } else {
    periods = Number.isInteger(options.periods) ? options.periods : 3;
    if (periods < 1 || periods > 24) {
      throw new Error('periods must be an integer between 1 and 24 (use horizon for a real time window instead)');
    }
    futureLabels = deriveFutureLabels(labels, periods);
  }

  const seriesForecasts = valuesArray.map((values, i) => {
    const nums = values.map(Number);
    if (nums.length < 2) {
      throw new Error(`Series "${names[i]}" needs at least 2 points to forecast a trend`);
    }
    const result = chooseForecastMethod(nums, periods, method);
    return {
      series: names[i],
      method: result.method,
      trend: result.slope > 0 ? 'increasing' : result.slope < 0 ? 'decreasing' : 'flat',
      slopePerPeriod: round2(result.slope),
      rSquared: round3(result.rSquared),
      mapePercent: round2(result.mape * 100),
      fitQuality: fitQualityLabel(result.rSquared),
      ...(result.candidates ? { candidates: result.candidates } : {}),
      projected: futureLabels.map((label, idx) => ({ label, value: result.projectedValues[idx] })),
    };
  });

  return {
    periods,
    horizon: horizonInfo,
    futureLabels,
    series: seriesForecasts,
  };
}

module.exports = {
  CHART_TYPES,
  FORECAST_METHODS,
  HORIZON_UNITS,
  THEMES,
  parseCsv,
  columnsToSeries,
  buildChart,
  analyzeData,
  forecastTrend,
};
