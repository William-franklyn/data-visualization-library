/**
 * Data Visualization Library
 * -----------------------------
 * A simple library to create basic charts using Chart.js.
 */
(function(window, Chart, Papa) {
    'use strict';

    // isFullscreen was global before; bringing it into the library's scope
    let isFullscreen = false;

    /**
     * Default configuration for the charts.
     */
    const defaultConfig = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y;
                        } else if (context.parsed !== null) {
                            label += context.parsed.value;
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
            },
            x: {
                
            }
        }
    };

    /**
     * Generates an array of random colors.
     * @param {number} num - The number of colors to generate.
     * @returns {string[]} An array of RGBA color strings.
     */
    function generateRandomColors(num) {
        const colors = [];
        for (let i = 0; i < num; i++) {
            const r = Math.floor(Math.random() * 255);
            const g = Math.floor(Math.random() * 255);
            const b = Math.floor(Math.random() * 255);
            colors.push(`rgba(${r},${g},${b},0.6)`);
        }
        return colors;
    }

    /**
     * Creates a chart using Chart.js.
     * @param {HTMLCanvasElement} ctx - The canvas element's context to render the chart in.
     * @param {string} chartType - The type of chart to create (e.g., 'bar', 'line', 'doughnut').
     * @param {string[]} labels - The labels for the chart's data.
     * @param {number[]} dataValues - The numerical data values for the chart.
     * @param {string[]} headerLabels - The labels for the headers.
     * @returns {Chart} The Chart.js instance.
     */
    function createChart(ctx, chartType, labels, dataValues, headerLabels) {
        if (!ctx) {
            console.error('Error: Invalid canvas context.');
            return null;
        }

        if (!chartType || !['bar', 'line', 'doughnut', 'polarArea'].includes(chartType)) {
            console.error('Error: Invalid chart type. Must be one of: bar, line, doughnut, polarArea');
            return null;
        }

        if (!labels || !Array.isArray(labels) || labels.length === 0) {
            console.error('Error: Labels must be a non-empty array.');
            return null;
        }

        if (!dataValues || !Array.isArray(dataValues) || dataValues.length === 0) {
            console.error('Error: Data values must be a non-empty array.');
            return null;
        }

        if (labels.length !== dataValues.length) {
            console.warn('Warning: Number of labels does not match the number of data values.');
        }

        let backgroundColor;
        let borderColor;

        if (chartType === 'bar' || chartType === 'line') {
            backgroundColor = 'rgba(75, 192, 192, 0.6)';
            borderColor = 'rgba(75, 192, 192, 1)';
        } else {
            backgroundColor = generateRandomColors(dataValues.length);
            borderColor = backgroundColor.map(color => color.replace('0.6', '1'));
        }

        const chartOptions = {
            ...defaultConfig, // Spread the default configuration
            scales: {
                ...defaultConfig.scales,
                y: {
                    ...defaultConfig.scales.y,
                    display: (chartType === 'bar' || chartType === 'line'),
                    title: {
                        display: headerLabels.length > 1 && (chartType === 'bar' || chartType === 'line'),
                        text: headerLabels[1] || '',
                        font: {
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    ...defaultConfig.scales.x,
                    display: (chartType === 'bar' || chartType === 'line'),
                    title: {
                        display: headerLabels.length > 1 && (chartType === 'bar' || chartType === 'line'),
                        text: headerLabels[0] || '',
                        font: {
                            weight: 'bold'
                        }
                    }
                }
            }
        };

        try {
            const myChartInstance = new Chart(ctx, {
                type: chartType,
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Data',
                        data: dataValues,
                        backgroundColor: backgroundColor,
                        borderColor: borderColor,
                        borderWidth: 1,
                        tension: chartType === 'line' ? 0.4 : 0,
                        fill: chartType === 'line' ? false : undefined
                    }]
                },
                options: chartOptions
            });
            return myChartInstance;
        } catch (error) {
            console.error('Error creating chart:', error);
            return null;
        }
    }

    /**
     * Parses data from a CSV file.
     * @param {File} file - The CSV file to parse.
     * @param {function} callback - A callback function to handle the parsed data.
     */
    function parseCSV(file, callback) {
        if (!file) {
            throw new Error('CSV file is required.');
        }

        if (typeof callback !== 'function') {
            throw new Error('Callback function is required.');
        }

        if (file.type !== 'text/csv') {
            alert('Invalid file type. Please upload a CSV file.');
            return;
        }

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results && results.data && results.data.length > 0) {
                    const headers = results.meta.fields;
                    const numberColumns = [];
                    for (let i = 0; i < headers.length; i++){
                        let isNumber = true;
                        for(let j = 0; j < results.data.length; j++){
                            if (isNaN(Number(results.data[j][headers[i]]))){
                                isNumber = false;
                                break;
                            }
                        }
                        if (isNumber){
                            numberColumns.push(i);
                        }
                    }

                    if (numberColumns.length === 0) {
                        alert('No numerical data found in the CSV file.');
                        return;
                    }
                    let dataColumnIndex = numberColumns[0];
                    if (numberColumns.length > 1){
                        const selectedColumn = prompt(`Multiple numeric columns found. Please enter the column number you want to visualize (starting from 1, e.g., "1", "2", etc.):\n${numberColumns.map((n, index) => `Column ${index + 1}: ${headers[n]}`).join(', ')}`);
                        const selectedColumnNumber = parseInt(selectedColumn, 10);
                        if (isNaN(selectedColumnNumber) || selectedColumnNumber < 1 || selectedColumnNumber > numberColumns.length) {
                            alert('Invalid column number. Using the first numeric column.');
                        }
                        else{
                            dataColumnIndex = numberColumns[selectedColumnNumber-1];
                        }
                    }
                    const dataValues = results.data.map(row => Number(row[headers[dataColumnIndex]]));
                    const labels = results.data.map(row => row[headers[0]] || `Data`);
                    const headerLabels = [headers[0], headers[dataColumnIndex]];
                    callback(labels, dataValues, headerLabels);
                } else {
                    alert('Error: The CSV file is empty or invalid.');
                }
            },
            error: function(error) {
                console.error('Error parsing CSV file:', error);
                alert('Error parsing CSV file. Please check the file format.');
            }
        });
    }

    /**
     * Clears the chart and resets the input fields.
     */
    function clearGraph(chartInstance, dataInput, labelInput, fileInput) {
        if (chartInstance) {
            chartInstance.destroy();
        }
        // Ensure elements exist before trying to access .value
        if (dataInput) dataInput.value = '';
        if (labelInput) labelInput.value = '';
        if (fileInput) fileInput.value = '';

        // These elements might not exist if the library is used in a different context
        // Consider making full-screen functionality optional or passed as parameters
        const container = document.querySelector('.container');
        if (container){
             container.classList.remove('fullscreen');
        }
    }

    /**
     * Toggles the chart between fullscreen and normal size.
     * Note: This function relies on specific HTML structure (e.g., .container, .chart-container)
     * and buttons (minimizeBtn, fullscreenBtn) which might not be present in all implementations.
     * Consider passing these elements as arguments for greater flexibility.
     */
    function toggleFullscreen(chartContainer, containerElement) {
        const minimizeBtn = document.getElementById('minimizeBtn'); // These specific IDs may not exist in user's HTML
        const fullscreenBtn = document.getElementById('fullscreenBtn'); // These specific IDs may not exist in user's HTML

        if (!isFullscreen) {
            // Fullscreen
            if (containerElement) containerElement.classList.add('fullscreen');
            if (chartContainer) chartContainer.classList.add('fullscreen');
            // If the buttons exist, hide/show them
            if (fullscreenBtn) fullscreenBtn.style.display = 'none';
            if (minimizeBtn) minimizeBtn.style.display = 'block';

            isFullscreen = true;
        } else {
            // Minimize
            if (containerElement) containerElement.classList.remove('fullscreen');
            if (chartContainer) chartContainer.classList.remove('fullscreen');
            // If the buttons exist, hide/show them
            if (fullscreenBtn) fullscreenBtn.style.display = 'block';
            if (minimizeBtn) minimizeBtn.style.display = 'none';

            isFullscreen = false;
        }
    }

    // Expose the library functions globally
    window.DataVisualizer = {
        createChart: createChart,
        parseCSV: parseCSV,
        clearGraph: clearGraph,
        toggleFullscreen: toggleFullscreen // Still included, but the button was removed
    };

})(window, Chart, Papa);


// --- Demo Page Specific JavaScript ---
// This part handles the interaction with the HTML elements on your demo page.
document.addEventListener('DOMContentLoaded', () => {
    const dataInput = document.getElementById('dataInput');
    const labelInput = document.getElementById('labelInput');
    const chartTypeSelect = document.getElementById('chartType');
    const visualizeBtn = document.getElementById('visualizeBtn');
    const clearBtn = document.getElementById('clearBtn');
    const ctx = document.getElementById('myChart').getContext('2d');
    const fileInput = document.getElementById('fileInput');
    const chartContainer = document.querySelector('.chart-container');
    const containerElement = document.querySelector('.container'); // For fullscreen if re-enabled

    let myChartInstance = null; // To keep track of the current Chart.js instance

    visualizeBtn.addEventListener('click', () => {
        const dataString = dataInput.value.trim();
        const labelString = labelInput.value.trim();
        const chartType = chartTypeSelect.value;

        if (!dataString && (!fileInput.files || fileInput.files.length === 0)) {
            alert('Please enter data or upload a CSV file.');
            return;
        }

        if (dataString) {
            const dataValues = dataString.split(',').map(Number);
            const labels = labelString
                ? labelString.split(',')
                : Array.from({ length: dataValues.length }, (_, i) => `Data ${i + 1}`);
            myChartInstance = DataVisualizer.createChart(ctx, chartType, labels, dataValues, []);
            if (!myChartInstance) return;
        } else if (fileInput.files && fileInput.files.length > 0) {
            DataVisualizer.parseCSV(fileInput.files[0], (labels, dataValues, headerLabels) => {
                 myChartInstance = DataVisualizer.createChart(ctx, chartType, labels, dataValues, headerLabels);
                 if (!myChartInstance) return;
            });
            return;
        }
    });

    clearBtn.addEventListener('click', () => {
        // Pass the specific input elements to clearGraph
        DataVisualizer.clearGraph(myChartInstance, dataInput, labelInput, fileInput);
        myChartInstance = null;
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.type !== 'text/csv') {
            alert('Invalid file type. Please upload a CSV file.');
            fileInput.value = '';
            return;
        }
    });

    // Fullscreen buttons and their event listeners are no longer present on the page.
});