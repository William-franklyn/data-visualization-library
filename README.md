# data-visualization-library

A lightweight JavaScript library to easily create and display various types of charts (bar, line, doughnut, polar area) from manually entered data or CSV file uploads.

## Features
- **Multiple Chart Types:** Bar, line, doughnut, and polar area charts
- **Manual Data Input:** Generate charts from comma-separated numbers and labels
- **CSV Import:** Upload CSV files with automatic column selection and header detection
- **Multi-series Support:** Visualize multiple data columns at once
- **AI Insights:** AI-powered data analysis powered by NVIDIA Nemotron via OpenRouter

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

## Dependencies
- [Chart.js](https://www.chartjs.org/)
- [Papa Parse](https://www.papaparse.com/)

## License
MIT License
