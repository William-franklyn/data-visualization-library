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
                            label += context.parsed;
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
            const b = Math.floor(Math.random() * 255);
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

        // Normalize: accept a flat array (single series) or array of arrays (multi-series)
        const valuesArray = Array.isArray(dataValues[0]) ? dataValues : [dataValues];
        const isXY = chartType === 'bar' || chartType === 'line';

        const palette = [
            [75,192,192],[255,99,132],[255,206,86],[54,162,235],
            [153,102,255],[255,159,64],[201,203,207]
        ];

        // For doughnut/polar only use the first series
        const datasetsData = isXY ? valuesArray : [valuesArray[0]];

        const datasets = datasetsData.map((vals, i) => {
            let backgroundColor, borderColor;
            if (datasetsData.length === 1 && !isXY) {
                backgroundColor = generateRandomColors(vals.length);
                borderColor     = backgroundColor.map(c => c.replace('0.6', '1'));
            } else if (datasetsData.length === 1) {
                backgroundColor = 'rgba(75, 192, 192, 0.6)';
                borderColor     = 'rgba(75, 192, 192, 1)';
            } else {
                const [r, g, b] = palette[i % palette.length];
                backgroundColor = `rgba(${r},${g},${b},0.6)`;
                borderColor     = `rgba(${r},${g},${b},1)`;
            }
            return {
                label: (headerLabels && headerLabels[i + 1]) || `Series ${i + 1}`,
                data: vals,
                backgroundColor,
                borderColor,
                borderWidth: 1,
                tension: chartType === 'line' ? 0.4 : 0,
                fill:    chartType === 'line' ? false : undefined,
            };
        });

        const chartOptions = {
            ...defaultConfig,
            scales: {
                ...defaultConfig.scales,
                y: {
                    ...defaultConfig.scales.y,
                    display: isXY,
                    title: {
                        display: headerLabels.length > 1 && isXY,
                        text: headerLabels[1] || '',
                        font: { weight: 'bold' }
                    }
                },
                x: {
                    ...defaultConfig.scales.x,
                    display: isXY,
                    title: {
                        display: headerLabels.length > 1 && isXY,
                        text: headerLabels[0] || '',
                        font: { weight: 'bold' }
                    }
                }
            }
        };

        try {
            const myChartInstance = new Chart(ctx, {
                type: chartType,
                data: { labels, datasets },
                options: chartOptions
            });
            return myChartInstance;
        } catch (error) {
            console.error('Error creating chart:', error);
            return null;
        }
    }

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
                if (!results || !results.data || results.data.length === 0) {
                    alert('Error: The CSV file is empty or invalid.');
                    return;
                }

                const headers = results.meta.fields;
                const colList = headers.map((h, i) => `${i + 1}: ${h}`).join('\n');

                // Label column selection
                const labelSel = prompt(`Select the label column (enter its number):\n\n${colList}`);
                let labelIdx = parseInt(labelSel, 10) - 1;
                if (isNaN(labelIdx) || labelIdx < 0 || labelIdx >= headers.length) {
                    alert('Invalid selection. Using column 1 as labels.');
                    labelIdx = 0;
                }

                // Data column(s) selection
                const dataSel = prompt(`Select data column(s) to visualize.\nEnter one number or several separated by commas:\n\n${colList}`);
                const dataIdxs = (dataSel || '')
                    .split(',')
                    .map(s => parseInt(s.trim(), 10) - 1)
                    .filter(n => !isNaN(n) && n >= 0 && n < headers.length);

                if (!dataIdxs.length) {
                    alert('No valid data columns selected.');
                    return;
                }

                const labelHeader = headers[labelIdx];
                const dataHeaders = dataIdxs.map(i => headers[i]);
                const labels      = results.data.map(row => String(row[labelHeader] ?? 'Data'));
                const valuesArray = dataHeaders.map(col => results.data.map(row => Number(row[col])));
                const headerLabels = [labelHeader, ...dataHeaders];

                callback(labels, valuesArray, headerLabels);
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
        const fullscreenBtn = document.getElementById('fullscreenBtn');

        if (!isFullscreen) {
            if (containerElement) containerElement.classList.add('fullscreen');
            if (chartContainer) chartContainer.classList.add('fullscreen');
            if (fullscreenBtn) fullscreenBtn.style.display = 'none';
            if (minimizeBtn) minimizeBtn.style.display = 'block';
            isFullscreen = true;
        } else {
            if (containerElement) containerElement.classList.remove('fullscreen');
            if (chartContainer) chartContainer.classList.remove('fullscreen');
            if (fullscreenBtn) fullscreenBtn.style.display = 'block';
            if (minimizeBtn) minimizeBtn.style.display = 'none';
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