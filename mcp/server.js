'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

const { CHART_TYPES, FORECAST_METHODS, HORIZON_UNITS, parseCsv, buildChart, analyzeData, forecastTrend } = require('./tools.js');
const { renderChartImage } = require('./render.js');
const { generateInsights } = require('./insights.js');

const seriesSchema = z.union([z.array(z.number()), z.array(z.array(z.number()))]);

const horizonSchema = z
  .object({
    value: z.number().positive(),
    unit: z.enum(HORIZON_UNITS),
  })
  .describe(
    'Predict a real-world time window instead of a fixed point count, e.g. {value:3,unit:"days"} or ' +
      '{value:6,unit:"hours"}. Requires labels that parse as dates/timestamps (e.g. "2024-01-01", ' +
      '"2024-01-01T10:00:00Z"), in increasing order — the sampling interval is auto-detected from them.'
  );

const forecastMethodSchema = z
  .enum(FORECAST_METHODS)
  .describe(
    'auto (default) fits both methods and uses whichever tracked the historical data more closely. ' +
      'exponential-smoothing (Holt\'s linear method) continuously re-weights toward recent movements — closer ' +
      'to "learning" a changing trend. linear fits one fixed straight line. Neither models seasonality/cycles.'
  );

function jsonResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err) {
  return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
}

function createServer() {
  const server = new McpServer({ name: 'data-visualizer-agent', version: '1.0.0' });

  server.registerTool(
    'parse_csv',
    {
      title: 'Parse CSV',
      description:
        'Parse raw CSV text into headers and rows, auto-detect which columns are numeric, and suggest a ' +
        'label column plus data column(s) to visualize. Use this before create_chart when starting from CSV data.',
      inputSchema: {
        csvText: z.string().describe('The full contents of a CSV file, including its header row.'),
      },
    },
    async ({ csvText }) => {
      try {
        return jsonResult(parseCsv(csvText));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'create_chart',
    {
      title: 'Create Chart',
      description:
        'Render a bar, line, doughnut, or polar area chart from labels and one or more numeric data series. ' +
        'Returns a PNG image plus the underlying Chart.js configuration. For bar/line charts, pass either ' +
        'forecastPeriods (N future points) or forecastHorizon (a real time window, e.g. "next 3 days") to ' +
        'overlay a dashed trend projection per series — see forecast_trend for the same math without a chart.',
      inputSchema: {
        chartType: z.enum(CHART_TYPES),
        labels: z.array(z.string()).min(1),
        series: seriesSchema.describe('A flat array of numbers for one series, or an array of arrays for multiple series.'),
        seriesLabels: z.array(z.string()).optional().describe('Display name for each series, in order.'),
        theme: z.string().optional().describe('teal (default), fire, ocean, grape, emerald, or sunset.'),
        title: z.string().optional(),
        xLabel: z.string().optional(),
        yLabel: z.string().optional(),
        forecastPeriods: z
          .number()
          .int()
          .min(1)
          .max(24)
          .optional()
          .describe('Bar/line charts only. Extends the chart with N future points drawn as a dashed line. Ignored if forecastHorizon is set.'),
        forecastHorizon: horizonSchema.optional(),
        forecastMethod: forecastMethodSchema.optional(),
      },
    },
    async ({ chartType, labels, series, seriesLabels, theme, title, xLabel, yLabel, forecastPeriods, forecastHorizon, forecastMethod }) => {
      try {
        const config = buildChart(chartType, labels, series, seriesLabels, {
          theme,
          title,
          xLabel,
          yLabel,
          forecastPeriods,
          forecastHorizon,
          forecastMethod,
        });
        const image = await renderChartImage(config);
        return {
          content: [
            { type: 'image', data: image.imageBase64, mimeType: image.mimeType },
            {
              type: 'text',
              text: `Chart image URL: ${image.url}\n\nChart.js config:\n${JSON.stringify(config)}`,
            },
          ],
        };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'analyze_data',
    {
      title: 'Analyze Data',
      description:
        'Compute deterministic statistics for one or more numeric series: sum, mean, median, min, max, trend, ' +
        'and IQR-based outliers per series, plus Pearson correlation between every pair of series (when 2+ are ' +
        'given). Free and instant — no AI call. Use this for quantitative facts before reaching for generate_insights.',
      inputSchema: {
        labels: z.array(z.string()).min(1),
        series: seriesSchema,
        seriesLabels: z.array(z.string()).optional(),
      },
    },
    async ({ labels, series, seriesLabels }) => {
      try {
        return jsonResult(analyzeData(labels, series, seriesLabels));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'forecast_trend',
    {
      title: 'Forecast Trend',
      description:
        'Project future values for one or more numeric series — either N future points, or a real time window ' +
        '(seconds/minutes/hours/days/weeks/months/years) if the labels are dates/timestamps. Returns per-series ' +
        'trend direction, slope, goodness-of-fit (R² and MAPE), and the projected values. Adaptive statistical ' +
        'forecasting (linear regression and/or Holt\'s exponential smoothing) — not a trained ML model, and it ' +
        'will not capture seasonality/cycles. Use create_chart with the same forecastPeriods/forecastHorizon ' +
        'options instead if you also want a picture.',
      inputSchema: {
        labels: z.array(z.string()).min(2),
        series: seriesSchema,
        seriesLabels: z.array(z.string()).optional(),
        periods: z
          .number()
          .int()
          .min(1)
          .max(24)
          .default(3)
          .describe('How many future points to project. Ignored if horizon is set.'),
        horizon: horizonSchema.optional(),
        method: forecastMethodSchema.optional(),
      },
    },
    async ({ labels, series, seriesLabels, periods, horizon, method }) => {
      try {
        return jsonResult(forecastTrend(labels, series, seriesLabels, { periods, horizon, method }));
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    'generate_insights',
    {
      title: 'Generate AI Insights',
      description:
        'Use an LLM to write a short natural-language analysis of a dataset (trends, peaks, comparisons), or answer ' +
        'a specific question about it. Requires ANTHROPIC_API_KEY or OPENROUTER_API_KEY to be set on the server.',
      inputSchema: {
        labels: z.array(z.string()).min(1),
        series: seriesSchema,
        seriesLabels: z.array(z.string()).optional(),
        chartType: z.enum(CHART_TYPES).optional(),
        question: z.string().optional().describe('Optional specific question to answer about the data instead of a generic summary.'),
      },
    },
    async ({ labels, series, seriesLabels, chartType, question }) => {
      try {
        const result = await generateInsights({ labels, series, seriesLabels, chartType, question });
        return { content: [{ type: 'text', text: `${result.text}\n\n(via ${result.provider}: ${result.model})` }] };
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}

module.exports = { createServer };
