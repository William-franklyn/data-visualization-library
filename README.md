# data-visualization-library

A lightweight JavaScript library to easily create and display various types of charts (bar, line, doughnut, polar area) from manually entered data or CSV file uploads.

## Features
- **Multiple Chart Types:** Bar, line, doughnut, and polar area charts
- **Manual Data Input:** Generate charts from comma-separated numbers and labels
- **CSV Import:** Upload CSV files with automatic column selection and header detection
- **Multi-series Support:** Visualize multiple data columns at once
- **AI Insights:** AI-powered data analysis (web demo runs on NVIDIA Nemotron via OpenRouter)
- **AI Agent (MCP):** The same charting/analysis logic is exposed as an [MCP](https://modelcontextprotocol.io)
  server — Claude Desktop, Claude Code, ChatGPT, or any other MCP-capable client can call it directly. See
  [AI Agent (MCP)](#ai-agent-mcp) below.

## How to Use

### Include the Library
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
<script src="path/to/data-visualizer-library.js"></script>
```

### Prepare your HTML
```html
<canvas id="myChart"></canvas>
```

### Create a Chart
```js
document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('myChart').getContext('2d');

    DataVisualizer.createChart(
        ctx,
        'bar',
        ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
        [100, 150, 80, 200, 120],
        ['Month', 'Sales']
    );
});
```

### Parse CSV Data
```js
document.addEventListener('DOMContentLoaded', () => {
    const ctx = document.getElementById('myChart').getContext('2d');
    const fileInput = document.getElementById('fileInput');

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            DataVisualizer.parseCSV(file, (labels, dataValues, headerLabels) => {
                DataVisualizer.createChart(ctx, 'line', labels, dataValues, headerLabels);
            });
        }
    });
});
```

## API Reference

### `DataVisualizer.createChart(ctx, chartType, labels, dataValues, headerLabels)`
| Param | Type | Description |
|-------|------|-------------|
| `ctx` | CanvasRenderingContext2D | The 2D context of a `<canvas>` element |
| `chartType` | string | `'bar'`, `'line'`, `'doughnut'`, or `'polarArea'` |
| `labels` | string[] | Labels for each data point |
| `dataValues` | number[] or number[][] | Single series (flat array) or multiple series (array of arrays) |
| `headerLabels` | string[] | `[xAxisLabel, yAxisLabel, ...]` for axis titles |

### `DataVisualizer.parseCSV(file, callback)`
| Param | Type | Description |
|-------|------|-------------|
| `file` | File | CSV file from an `<input type="file">` |
| `callback` | function | Receives `(labels, valuesArray, headerLabels)` after parsing |

### `DataVisualizer.clearGraph(chartInstance, dataInput, labelInput, fileInput)`
Destroys the chart instance and clears all input fields.

## AI Agent (MCP)

This repo also ships as an **AI agent**: the same CSV-parsing and chart-building logic, wrapped in
an [MCP](https://modelcontextprotocol.io) server so it can be called directly by Claude, ChatGPT,
or any other MCP-capable app — not just clicked through in a browser.

### Tools

| Tool | What it does | Needs an API key? |
|------|--------------|--------------------|
| `parse_csv` | Parses raw CSV text, auto-detects numeric columns (tolerating a few blank cells), flags missing values per column, and returns ready-to-use `extracted.{labels,series}` for the suggested (or chosen) columns — no hand-transcribing rows | No |
| `create_chart` | Builds a bar/line/doughnut/polarArea chart and renders it to a PNG (via [QuickChart.io](https://quickchart.io)). Pass `forecastPeriods` or `forecastHorizon` to overlay a dashed trend projection. | No |
| `analyze_data` | Deterministic stats — sum, mean, median, min/max, trend, IQR-based outliers per series, and Pearson correlation between every pair of series | No |
| `compare_periods` | Period-over-period comparison — this week vs last week, this month vs last month, or any two equal-length blocks — with sum/mean and % change per series | No |
| `forecast_trend` | Projects future values without rendering a chart — trend direction, slope, fit quality, and the projected numbers | No |
| `generate_insights` | LLM-written analysis or answer to a specific question about the data | Yes |

Only `generate_insights` needs an AI provider — see [Environment variables](#environment-variables).
Everything else works with zero configuration.

### CSV handling

`parse_csv` no longer disqualifies a whole column from "numeric" just because a few cells are
blank — it reports `missingCounts` per column instead. Its `extracted` field does the row→series
extraction for you (using the suggested columns, or `labelColumn`/`dataColumns` if you pass them):
rows with a blank label or a blank/non-numeric value in a selected data column are dropped rather
than silently coerced to `0`, with `extracted.droppedRowCount` telling you how many. Feed
`extracted.labels` / `extracted.series` / `extracted.seriesLabels` straight into `create_chart`,
`analyze_data`, `compare_periods`, or `forecast_trend`.

### Period comparison

`compare_periods` compares the most recent period of data against the period right before it —
"this week vs last week," "this quarter vs last quarter," or just the last N points vs the N
before that. Like forecasting, a period is defined either as a fixed point count (`periodLength`)
or a real time window (`period: {value, unit}`) when the labels are dates/timestamps, using the
same interval auto-detection as `forecastHorizon`. Reports sum/mean for each period and the %
change between them per series (`null` when the previous period summed to zero, since a percentage
change from zero is undefined).

### Forecasting

`forecast_trend` and `create_chart` share the same forecasting engine, with two ways to specify how
far ahead to look:

- **`periods` (1–24):** project N more points, continuing the label pattern (e.g. `2024, 2025 →
  2026, 2027, ...`).
- **`horizon: { value, unit }`:** project a real time window instead — `unit` is one of `seconds`,
  `minutes`, `hours`, `days`, `weeks`, `months`, `years` (e.g. "next 3 days", "next 6 hours", "next
  2 years"). Requires labels that parse as dates/timestamps in increasing order; the sampling
  interval is auto-detected from them and the horizon is converted to however many points that
  spans (capped at 365 for chart readability).

Two forecasting methods are available via `method`:

- **`linear`** — a single straight-line trend fit to the whole series.
- **`exponential-smoothing`** — Holt's linear method, which re-estimates the trend at every point
  and weights recent movements more heavily than old ones, so it adapts when a series accelerates,
  decelerates, or shifts level partway through.
- **`auto`** (default) — fits both and uses whichever tracked the historical data more closely
  (lower MAPE), reporting both scores under `candidates` so you can see why.

This is adaptive statistical forecasting, not a trained neural network — there's no training step,
no model weights, and no external inference call, so it runs in milliseconds on whatever data you
hand it. It also won't capture seasonality or cyclical patterns (a December sales spike, a Monday
traffic dip); it extrapolates the recent trend. Every forecast reports `rSquared`/`mapePercent`/
`fitQuality` so you can judge, per series, how much to trust the projection before acting on it.

### Run it locally (Claude Desktop / Claude Code)

```bash
npm install
```

**Claude Code:**

```bash
claude mcp add data-visualizer -- node /absolute/path/to/data-visualization-library/mcp/stdio.js
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "data-visualizer": {
      "command": "node",
      "args": ["/absolute/path/to/data-visualization-library/mcp/stdio.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-ant-..." }
    }
  }
}
```

### Use the hosted version (Claude.ai / ChatGPT / anywhere else)

The same server is also deployed as a Streamable HTTP MCP endpoint at:

```
https://datavz.vercel.app/api/mcp
```

Add it as a remote MCP connector — in Claude.ai this is under Settings → Connectors → Add custom
connector; ChatGPT's Apps/Connectors surface also speaks MCP. No install required.

### Environment variables

| Variable | Required for | Notes |
|----------|---------------|-------|
| `OPENROUTER_API_KEY` | `generate_insights` (fallback), the existing web demo's AI Insights panel | Already in use — free-tier OpenRouter models, which is why the git history shows several model swaps chasing rate limits. |
| `ANTHROPIC_API_KEY` | `generate_insights` (preferred) | If set, `generate_insights` uses Claude (`claude-opus-5`) instead of OpenRouter — more reliable than free-tier models. Not required for the agent to work; only needed if you want this upgrade. |

If neither variable is set, `parse_csv`, `create_chart`, and `analyze_data` still work — only
`generate_insights` will return an error telling you which env var to add.

## Dependencies
- [Chart.js](https://www.chartjs.org/)
- [Papa Parse](https://www.papaparse.com/)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (AI agent)
- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) (AI agent, optional Claude provider)

## License
MIT License
