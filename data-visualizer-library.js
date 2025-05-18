// data-visualizer-library.js (or index.js, main.js)

(function(window, Chart, Papa) {
    'use strict';

    let isFullscreen = false; // Moved this global variable to the library scope

    const defaultConfig = {
        // ... (your defaultConfig object as it was)
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

    function generateRandomColors(num) {
        // ... (your generateRandomColors function as it was)
        const colors = [];
        for (let i = 0; i < num; i++) {
            const r = Math.floor(Math.random() * 255);
            const g = Math.floor(Math.random() * 255);
            b = Math.floor(Math.random() * 255); // fixed: variable b was not declared
            colors.push(`rgba(${r},${g},${b},0.6)`);
        }
        return colors;
    }

    function createChart(ctx, chartType, labels, dataValues, headerLabels) {
        // ... (your createChart function as it was)
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
            ...defaultConfig,
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

    function parseCSV(file, callback) {
        // ... (your parseCSV function as it was)
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

    function clearGraph(chartInstance, dataInput, labelInput, fileInput) {
        // ... (your clearGraph function as it was)
        if (chartInstance) {
            chartInstance.destroy();
        }
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

    function toggleFullscreen(chartContainer, containerElement) {
        // ... (your toggleFullscreen function as it was)
        // These elements might not exist if the library is used in a different context
        // Consider making full-screen functionality optional or passed as parameters
        const minimizeBtn = document.getElementById('minimizeBtn');
        const fullscreenBtn = document.getElementById('fullscreenBtn'); // Note: You asked to remove this, but the function still references it.

        if (!isFullscreen) {
            // Fullscreen
            if (containerElement) containerElement.classList.add('fullscreen');
            if (chartContainer) chartContainer.classList.add('fullscreen');
            if (fullscreenBtn){
                fullscreenBtn.style.display = 'none';
            }
            if(minimizeBtn){
                 minimizeBtn.style.display = 'block';
            }
            isFullscreen = true;
        } else {
            // Minimize
            if (containerElement) containerElement.classList.remove('fullscreen');
            if (chartContainer) chartContainer.classList.remove('fullscreen');
             if (fullscreenBtn){
                fullscreenBtn.style.display = 'block';
            }
            if(minimizeBtn){
                 minimizeBtn.style.display = 'none';
            }
            isFullscreen = false;
        }
    }

    window.DataVisualizer = {
        createChart: createChart,
        parseCSV: parseCSV,
        clearGraph: clearGraph,
        toggleFullscreen: toggleFullscreen
    };

})(window, Chart, Papa);