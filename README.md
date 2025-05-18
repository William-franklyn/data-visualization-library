data-visualization-library
A lightweight JavaScript library to easily create and display various types of charts (bar, line, doughnut, polar area) from manually entered data or CSV file uploads.

Features Supports Multiple Chart Types: Visualize your data as bar, line, doughnut, or polar area charts. Manual Data Input: Quickly generate charts from comma-separated numerical data and labels. CSV Import: Upload CSV files to visualize your data, with automatic header detection for axis labels. Easy to Use: A straightforward API to integrate charting into your web projects. How to Use Include the Library: Add the following script tags to your HTML file, preferably at the end of the section:

HTML

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script> <script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script> <script src="path/to/your/data-visualizer.js"></script>
(Replace path/to/your/data-visualizer.js with the actual path where you save your library file.)

Prepare your HTML: You'll need a element where the chart will be drawn.

HTML

Create a Chart: In your JavaScript, get the canvas context and use DataVisualizer.createChart():

JavaScript

document.addEventListener('DOMContentLoaded', () => { const ctx = document.getElementById('myChart').getContext('2d');

// Example: Create a Bar Chart with manual data
DataVisualizer.createChart(
    ctx,
    'bar',
    ['Jan', 'Feb', 'Mar', 'Apr', 'May'], // Labels
    [100, 150, 80, 200, 120],            // Data Values
    ['Month', 'Sales']                   // Header Labels (for axis titles)
);

// You can also clear the chart if needed
// DataVisualizer.clearGraph(myChartInstance, dataInput, labelInput, fileInput);
}); Parse CSV Data: To visualize data from a CSV file, use DataVisualizer.parseCSV():

JavaScript

document.addEventListener('DOMContentLoaded', () => { const ctx = document.getElementById('myChart').getContext('2d'); const fileInput = document.getElementById('fileInput'); // Assuming you have an input type="file"

fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        DataVisualizer.parseCSV(file, (labels, dataValues, headerLabels) => {
            DataVisualizer.createChart(ctx, 'line', labels, dataValues, headerLabels);
        });
    }
});
}); API Reference DataVisualizer.createChart(ctx, chartType, labels, dataValues, headerLabels)

ctx (CanvasRenderingContext2D): The 2D rendering context of the element. chartType (string): The type of chart ('bar', 'line', 'doughnut', 'polarArea'). labels (string[]): An array of labels for the data points. dataValues (number[]): An array of numerical data values. headerLabels (string[]): An array [xAxisLabel, yAxisLabel] for axis titles (optional, primarily for bar/line charts). DataVisualizer.parseCSV(file, callback)

file (File): The CSV file object from an . callback (function): A function that receives (labels, dataValues, headerLabels) once the CSV is parsed. DataVisualizer.clearGraph(chartInstance, dataInput, labelInput, fileInput)

chartInstance (Chart): The Chart.js instance to destroy. dataInput (HTMLInputElement): Reference to your data input field (for clearing). labelInput (HTMLInputElement): Reference to your label input field (for clearing). fileInput (HTMLInputElement): Reference to your file input field (for clearing). Dependencies This library relies on:

Chart.js for chart rendering. Papa Parse for CSV parsing. Make sure these libraries are included in your project before data-visualizer.js.

License MIT License