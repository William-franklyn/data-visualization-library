/**
 * DataViz Studio — script.js
 */

/* ── AI Config ──
   The API key lives in Vercel → Settings → Environment Variables as OPENROUTER_API_KEY.
   Never paste the key here — requests go through /api/ai which keeps the key server-side.
   To change model: https://openrouter.ai/models → filter Free → copy the model ID */
const AI_MODEL = 'mistralai/mistral-7b-instruct:free';

async function askAI(prompt) {
    const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: AI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 500,
        }),
    });
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.error?.message || res.statusText;
        throw new Error(`AI error ${res.status}: ${msg}`);
    }
    const data = await res.json();
    const msg = data.choices[0].message;

    const content = msg.content?.trim();
    if (!content) throw new Error('AI returned an empty response.');
    return content.trim();
}

/* ── Wait for all scripts to be ready ── */
window.addEventListener('load', function () {

    /* ── Safely register plugins ── */
    if (typeof ChartDataLabels !== 'undefined') {
        Chart.register(ChartDataLabels);
    } else {
        console.warn('chartjs-plugin-datalabels not loaded — data labels disabled.');
    }
    // chartjs-plugin-zoom self-registers when loaded; no manual call needed.

    /* ══════════════════════════════════════════════════
       STATE
    ══════════════════════════════════════════════════ */
    let myChartInstance   = null;
    let currentLabels     = [];
    let currentValues     = [];
    let currentHeaders    = [];
    let selectedType      = 'bar';
    let selectedTheme     = 'custom';
    let showTable         = false;
    let cachedCSV         = null;
    let cachedRawCSV      = null;
    let isFullscreen      = false;
    let zoomEnabled       = false;
    let zoomMode          = 'wheel'; // 'wheel' | 'box' | 'pan'

    const opts = {
        legend:       true,
        datalabels:   false,
        grid:         true,
        legendPos:    'top',
        easing:       'easeInOutQuart',
        barThickness: 0.6,
        horizontal:   false,
        tension:      0.4,
        pointSize:    4,
        fill:         false,
        cutout:       '50%',
        yMin:         '',
        yMax:         '',
    };

    /* ══════════════════════════════════════════════════
       COLOR THEMES
    ══════════════════════════════════════════════════ */
    const THEMES = {
        teal:      { s: ['rgba(75,192,192,0.75)',  'rgba(75,192,192,1)'],   m: [[75,192,192],[54,162,235],[255,206,86],[255,99,132],[153,102,255],[255,159,64],[201,203,207]] },
        fire:      { s: ['rgba(232,82,26,0.75)',   'rgba(232,82,26,1)'],    m: [[232,82,26],[249,115,22],[251,191,36],[239,68,68],[234,88,12],[253,224,71],[220,38,38]] },
        ocean:     { s: ['rgba(37,99,235,0.75)',   'rgba(37,99,235,1)'],    m: [[37,99,235],[96,165,250],[14,165,233],[6,182,212],[99,102,241],[34,211,238],[59,130,246]] },
        grape:     { s: ['rgba(124,58,237,0.75)',  'rgba(124,58,237,1)'],   m: [[124,58,237],[167,139,250],[219,39,119],[244,114,182],[139,92,246],[196,181,253],[236,72,153]] },
        emerald:   { s: ['rgba(5,150,105,0.75)',   'rgba(5,150,105,1)'],    m: [[5,150,105],[52,211,153],[16,185,129],[6,182,212],[132,204,22],[34,197,94],[20,184,166]] },
        rose:      { s: ['rgba(225,29,72,0.75)',   'rgba(225,29,72,1)'],    m: [[225,29,72],[251,113,133],[244,63,94],[253,164,175],[190,18,60],[254,205,211],[159,18,57]] },
        rainbow:   { s: ['rgba(99,102,241,0.75)',  'rgba(99,102,241,1)'],   m: null },
        sunset:    { s: ['rgba(251,113,133,0.75)', 'rgba(251,113,133,1)'],  m: [[251,113,133],[251,146,60],[251,191,36],[250,204,21],[253,224,71],[252,165,165],[254,215,170]] },
        arctic:    { s: ['rgba(56,189,248,0.75)',  'rgba(56,189,248,1)'],   m: [[148,226,255],[56,189,248],[125,211,252],[186,230,253],[224,242,254],[103,232,249],[7,182,212]] },
        mango:     { s: ['rgba(255,183,0,0.75)',   'rgba(230,140,0,1)'],    m: [[255,183,0],[255,140,0],[255,100,30],[255,60,60],[255,200,50],[230,100,0],[200,50,0]] },
        coral:     { s: ['rgba(255,127,80,0.75)',  'rgba(255,80,40,1)'],    m: [[255,127,80],[255,160,122],[255,99,71],[255,69,0],[250,128,114],[233,150,122],[205,92,92]] },
        lavender:  { s: ['rgba(196,181,253,0.75)', 'rgba(139,92,246,1)'],   m: [[196,181,253],[167,139,250],[139,92,246],[109,40,217],[91,33,182],[221,214,254],[237,233,254]] },
        midnight:  { s: ['rgba(99,102,241,0.75)',  'rgba(55,48,163,1)'],    m: [[99,102,241],[129,140,248],[79,70,229],[55,48,163],[67,56,202],[165,180,252],[30,27,75]] },
        forest:    { s: ['rgba(34,197,94,0.75)',   'rgba(21,128,61,1)'],    m: [[34,197,94],[21,128,61],[74,222,128],[134,239,172],[5,150,105],[16,185,129],[6,95,70]] },
        pastel:    { s: ['rgba(186,225,255,0.75)', 'rgba(130,180,255,1)'],  m: [[186,225,255],[255,186,209],[186,255,201],[255,240,186],[240,186,255],[186,255,243],[255,214,186]] },
        neon:      { s: ['rgba(0,255,180,0.75)',   'rgba(0,200,140,1)'],    m: [[0,255,180],[255,0,200],[0,200,255],[255,255,0],[255,100,0],[180,0,255],[0,255,80]] },
        candy:     { s: ['rgba(255,105,180,0.75)', 'rgba(255,20,147,1)'],   m: [[255,105,180],[135,206,250],[152,251,152],[255,215,0],[255,160,122],[176,224,230],[221,160,221]] },
        earth:     { s: ['rgba(161,110,60,0.75)',  'rgba(120,78,40,1)'],    m: [[161,110,60],[180,140,90],[120,78,40],[200,175,130],[90,120,60],[140,100,50],[210,180,140]] },
        slate:     { s: ['rgba(100,116,139,0.75)', 'rgba(71,85,105,1)'],    m: [[100,116,139],[71,85,105],[148,163,184],[51,65,85],[203,213,225],[30,41,59],[241,245,249]] },
        mono:      { s: ['rgba(100,100,100,0.75)', 'rgba(30,30,30,1)'],     m: [[30,30,30],[70,70,70],[110,110,110],[150,150,150],[190,190,190],[210,210,210],[240,240,240]] },
        custom:    { s: ['rgba(75,192,192,0.75)',  'rgba(75,192,192,1)'],   m: null, hue: 180 },
    };

    function getColors(chartType, count) {
        const theme = THEMES[selectedTheme] || THEMES.teal;
        const isXY  = chartType === 'bar' || chartType === 'line';

        if (isXY) return { bg: theme.s[0], border: theme.s[1] };

        // Multi-color (doughnut, polar) — generate HSL spread from starting hue
        if (!theme.m) {
            const startHue = theme.hue !== undefined ? theme.hue : 0;
            const bgs = [], borders = [];
            for (let i = 0; i < count; i++) {
                const h = Math.round((startHue + (i / count) * 360) % 360);
                bgs.push(`hsla(${h},80%,58%,0.78)`);
                borders.push(`hsl(${h},80%,44%)`);
            }
            return { bg: bgs, border: borders };
        }

        const bgs = [], borders = [];
        for (let i = 0; i < count; i++) {
            const [r, g, b] = theme.m[i % theme.m.length];
            bgs.push(`rgba(${r},${g},${b},0.78)`);
            borders.push(`rgba(${r},${g},${b},1)`);
        }
        return { bg: bgs, border: borders };
    }

    /* ══════════════════════════════════════════════════
       BUILD CHART CONFIG
    ══════════════════════════════════════════════════ */
    function buildConfig(chartType, labels, valuesArray, headerLabels) {
        const isXY = chartType === 'bar' || chartType === 'line';

        // Doughnut / polar only use first series
        const datasetsData = isXY ? valuesArray : [valuesArray[0]];
        const theme = THEMES[selectedTheme] || THEMES.teal;

        const datasets = datasetsData.map((dataValues, dsIdx) => {
            let bg, border;
            if (datasetsData.length === 1) {
                const c = getColors(chartType, dataValues.length);
                bg = c.bg; border = c.border;
            } else {
                // Each series gets its own distinct color from the palette
                const palette = theme.m || [[75,192,192],[255,99,132],[255,206,86],[54,162,235],[153,102,255],[255,159,64],[201,203,207]];
                const [r, g, b] = palette[dsIdx % palette.length];
                bg = `rgba(${r},${g},${b},0.75)`;
                border = `rgba(${r},${g},${b},1)`;
            }
            const ds = {
                label: (headerLabels && headerLabels[dsIdx + 1]) || `Series ${dsIdx + 1}`,
                data: dataValues,
                backgroundColor: bg,
                borderColor: border,
                borderWidth: 1.5,
            };
            if (chartType === 'bar') {
                ds.barPercentage = opts.barThickness;
                ds.categoryPercentage = 0.8;
            }
            if (chartType === 'line') {
                ds.tension          = opts.tension;
                ds.pointRadius      = opts.pointSize;
                ds.pointHoverRadius = opts.pointSize + 2;
                ds.fill             = opts.fill;
            }
            return ds;
        });

        // Grid color (read CSS var safely)
        let gridColor = '#e0dbd4';
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue('--border').trim();
            if (v) gridColor = v;
        } catch (_) {}

        // Zoom plugin config (only if plugin is available)
        const zoomConfig = (typeof Chart.registry !== 'undefined' && Chart.registry.plugins.get('zoom')) ? {
            zoom: {
                zoom: {
                    wheel: { enabled: zoomEnabled && zoomMode === 'wheel', speed: 0.1 },
                    pinch: { enabled: zoomEnabled },
                    drag:  {
                        enabled: zoomEnabled && zoomMode === 'box',
                        backgroundColor: 'rgba(232,82,26,0.12)',
                        borderColor: 'rgba(232,82,26,0.7)',
                        borderWidth: 1.5,
                    },
                    mode: isXY ? 'x' : 'xy',
                },
                pan: {
                    enabled: zoomEnabled && zoomMode === 'pan',
                    mode: isXY ? 'x' : 'xy',
                    threshold: 5,
                },
                limits: { x: { minRange: 1 }, y: { minRange: 1 } },
            }
        } : {};

        // Data labels config (only if plugin loaded)
        const datalabelsConfig = (typeof ChartDataLabels !== 'undefined') ? {
            datalabels: {
                display: opts.datalabels,
                color: '#fff',
                font: { family: "'Space Mono', monospace", size: 10, weight: 'bold' },
                formatter: v => (typeof v === 'number') ? (Number.isInteger(v) ? v : v.toFixed(1)) : v,
                anchor: chartType === 'bar' ? 'end'    : 'center',
                align:  chartType === 'bar' ? 'end'    : 'center',
                offset: chartType === 'bar' ? 4        : 0,
                backgroundColor: chartType === 'bar' ? null : 'rgba(0,0,0,0.45)',
                borderRadius: 3,
                padding: 3,
            }
        } : { datalabels: { display: false } };

        const yMin = opts.yMin !== '' && opts.yMin !== undefined ? Number(opts.yMin) : undefined;
        const yMax = opts.yMax !== '' && opts.yMax !== undefined ? Number(opts.yMax) : undefined;

        return {
            type: chartType,
            data: { labels, datasets },
            options: {
                indexAxis: (chartType === 'bar' && opts.horizontal) ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 650, easing: opts.easing },
                cutout: chartType === 'doughnut' ? opts.cutout : undefined,
                plugins: {
                    legend: {
                        display: opts.legend,
                        position: opts.legendPos,
                        labels: { font: { family: "'Space Mono', monospace", size: 11 } },
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                const val = ctx.parsed.y ?? ctx.parsed;
                                return ` ${ctx.dataset.label}: ${val}`;
                            }
                        }
                    },
                    ...datalabelsConfig,
                    ...zoomConfig,
                },
                scales: isXY ? {
                    y: {
                        display: true,
                        beginAtZero: true,
                        min: yMin,
                        max: yMax,
                        grid: { display: opts.grid, color: gridColor },
                        title: {
                            display: !!(headerLabels && headerLabels.length > 1),
                            text: opts.horizontal ? (headerLabels[0] || '') : (headerLabels[1] || ''),
                            font: { weight: 'bold', family: "'Space Mono', monospace", size: 11 },
                        },
                        ticks: { font: { family: "'Space Mono', monospace", size: 10 } },
                    },
                    x: {
                        display: true,
                        grid: { display: opts.grid, color: gridColor },
                        title: {
                            display: !!(headerLabels && headerLabels.length > 1),
                            text: opts.horizontal ? (headerLabels[1] || '') : (headerLabels[0] || ''),
                            font: { weight: 'bold', family: "'Space Mono', monospace", size: 11 },
                        },
                        ticks: { font: { family: "'Space Mono', monospace", size: 10 } },
                    },
                } : {},
            }
        };
    }

    /* ══════════════════════════════════════════════════
       CHART CREATE / RENDER
    ══════════════════════════════════════════════════ */
    function renderChart() {
        if (!currentLabels.length || !currentValues.length) return;
        if (myChartInstance) { myChartInstance.destroy(); myChartInstance = null; }
        const canvas = document.getElementById('myChart');
        canvas.style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';
        try {
            myChartInstance = new Chart(canvas.getContext('2d'),
                buildConfig(selectedType, currentLabels, currentValues, currentHeaders));
        } catch (e) {
            console.error('Chart render error:', e);
            showToast('⚠ Chart error — check console');
        }
    }

    /* ══════════════════════════════════════════════════
       CSV PARSE
    ══════════════════════════════════════════════════ */
    function parseCSV(file, callback) {
        if (!file || (!file.name.endsWith('.csv') && file.type !== 'text/csv')) {
            showToast('⚠ Please upload a valid .csv file.');
            return;
        }
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete(results) {
                if (!results?.data?.length) { showToast('⚠ CSV is empty or invalid.'); return; }
                callback(results.meta.fields, results.data);
            },
            error: e => { console.error(e); showToast('⚠ Error parsing CSV.'); }
        });
    }

    /* ══════════════════════════════════════════════════
       UI HELPERS
    ══════════════════════════════════════════════════ */
    function showToast(msg) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2800);
    }

    function updateStats(valuesArray) {
        const all = valuesArray.flat();
        if (!all.length) return;
        const total = all.reduce((a, b) => a + b, 0);
        const fmt   = n => Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
        document.getElementById('statTotal').textContent = fmt(total);
        document.getElementById('statAvg').textContent   = fmt(total / all.length);
        document.getElementById('statMax').textContent   = fmt(Math.max(...all));
        document.getElementById('statMin').textContent   = fmt(Math.min(...all));
        document.getElementById('statsBar').style.display = '';
    }

    function updateDataTable(labels, valuesArray, headers) {
        const tbody = document.getElementById('dataTableBody');
        const thead = tbody.closest('table').querySelector('thead tr');
        tbody.innerHTML = '';
        thead.innerHTML = '<th>#</th><th>' + (headers[0] || 'Label') + '</th>' +
            valuesArray.map((_, i) => `<th>${headers[i + 1] || 'Value ' + (i + 1)}</th>`).join('');
        labels.forEach((lbl, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${i + 1}</td><td>${lbl}</td>` +
                valuesArray.map(vals => `<td class="num">${vals[i] ?? '—'}</td>`).join('');
            tbody.appendChild(tr);
        });
    }

    function updateOptionGroups(type) {
        document.getElementById('grpBar').classList.toggle('visible',      type === 'bar');
        document.getElementById('grpLine').classList.toggle('visible',     type === 'line');
        document.getElementById('grpDoughnut').classList.toggle('visible', type === 'doughnut' || type === 'polarArea');
        document.getElementById('grpAxis').classList.toggle('visible',     type === 'bar' || type === 'line');
    }

    /* ══════════════════════════════════════════════════
       INIT DOM
    ══════════════════════════════════════════════════ */
    const $  = id => document.getElementById(id);
    const $$ = sel => document.querySelectorAll(sel);

    // Chart type buttons
    $$('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.chart-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedType = btn.dataset.type;
            updateOptionGroups(selectedType);
            if (myChartInstance) renderChart();
        });
    });
    updateOptionGroups(selectedType);

    // ── Color picker ──
    (function () {
        const canvas     = $('colorPickerCanvas');
        const pc         = canvas.getContext('2d');
        const hueSlider  = $('hueSlider');
        const hexInputEl = $('hexInput');
        const preview    = $('colorPreview');
        const nameEl     = $('activeThemeName');

        let hue = 180;
        let pickerX = Math.round(canvas.width  * 0.7);
        let pickerY = Math.round(canvas.height * 0.3);

        function drawCanvas() {
            const w = canvas.width, h = canvas.height;
            const satGrad = pc.createLinearGradient(0, 0, w, 0);
            satGrad.addColorStop(0, '#fff');
            satGrad.addColorStop(1, `hsl(${hue},100%,50%)`);
            pc.fillStyle = satGrad;
            pc.fillRect(0, 0, w, h);
            const valGrad = pc.createLinearGradient(0, 0, 0, h);
            valGrad.addColorStop(0, 'transparent');
            valGrad.addColorStop(1, '#000');
            pc.fillStyle = valGrad;
            pc.fillRect(0, 0, w, h);
            // Crosshair
            pc.beginPath();
            pc.arc(pickerX, pickerY, 6, 0, 2 * Math.PI);
            pc.strokeStyle = 'rgba(255,255,255,0.9)';
            pc.lineWidth = 2;
            pc.stroke();
            pc.beginPath();
            pc.arc(pickerX, pickerY, 6, 0, 2 * Math.PI);
            pc.strokeStyle = 'rgba(0,0,0,0.4)';
            pc.lineWidth = 1;
            pc.stroke();
        }

        function readPixel(x, y) {
            const d = pc.getImageData(
                Math.max(0, Math.min(canvas.width  - 1, Math.round(x))),
                Math.max(0, Math.min(canvas.height - 1, Math.round(y))),
                1, 1
            ).data;
            return [d[0], d[1], d[2]];
        }

        function toHex(r, g, b) {
            return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
        }

        function applyColor(r, g, b) {
            const hex = toHex(r, g, b);
            hexInputEl.value = hex;
            preview.style.background = hex;
            nameEl.textContent = hex.toUpperCase();
            THEMES.custom = { s: [`rgba(${r},${g},${b},0.75)`, `rgba(${r},${g},${b},1)`], m: null, hue };
            selectedTheme = 'custom';
            if (myChartInstance) renderChart();
        }

        function pickAt(x, y) {
            pickerX = Math.max(0, Math.min(canvas.width  - 1, x));
            pickerY = Math.max(0, Math.min(canvas.height - 1, y));
            drawCanvas();
            applyColor(...readPixel(pickerX, pickerY));
        }

        function canvasCoords(e) {
            const r  = canvas.getBoundingClientRect();
            const sx = canvas.width  / r.width;
            const sy = canvas.height / r.height;
            const src = e.touches ? e.touches[0] : e;
            return [(src.clientX - r.left) * sx, (src.clientY - r.top) * sy];
        }

        let dragging = false;
        canvas.addEventListener('mousedown',  e => { dragging = true;  pickAt(...canvasCoords(e)); });
        window.addEventListener('mousemove',  e => { if (dragging) pickAt(...canvasCoords(e)); });
        window.addEventListener('mouseup',    ()  => { dragging = false; });
        canvas.addEventListener('touchstart', e => { e.preventDefault(); pickAt(...canvasCoords(e)); }, { passive: false });
        canvas.addEventListener('touchmove',  e => { e.preventDefault(); pickAt(...canvasCoords(e)); }, { passive: false });

        hueSlider.addEventListener('input', () => {
            hue = Number(hueSlider.value);
            drawCanvas();
            applyColor(...readPixel(pickerX, pickerY));
        });

        hexInputEl.addEventListener('change', e => {
            const v = e.target.value.trim();
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) return;
            const r = parseInt(v.slice(1, 3), 16);
            const g = parseInt(v.slice(3, 5), 16);
            const b = parseInt(v.slice(5, 7), 16);
            preview.style.background = v;
            nameEl.textContent = v.toUpperCase();
            THEMES.custom = { s: [`rgba(${r},${g},${b},0.75)`, `rgba(${r},${g},${b},1)`], m: null, hue };
            selectedTheme = 'custom';
            if (myChartInstance) renderChart();
        });

        // Initial draw + pick
        drawCanvas();
        applyColor(...readPixel(pickerX, pickerY));
    })();

    // Dark mode toggle
    $('themeToggle').addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
        $('themeLabel').textContent = isDark ? 'Light' : 'Dark';
        if (myChartInstance) renderChart();
    });

    // Toggle buttons (on/off)
    function wireToggle(id, optKey) {
        const btn = $(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
            btn.classList.toggle('on');
            opts[optKey] = btn.classList.contains('on');
            if (myChartInstance) renderChart();
        });
    }
    wireToggle('optLegend',     'legend');
    wireToggle('optDataLabels', 'datalabels');
    wireToggle('optGrid',       'grid');
    wireToggle('optHorizontal', 'horizontal');
    wireToggle('optFill',       'fill');

    // Select dropdowns
    $('optLegendPos').addEventListener('change', e => { opts.legendPos = e.target.value; if (myChartInstance) renderChart(); });
    $('optEasing').addEventListener('change',    e => { opts.easing    = e.target.value; if (myChartInstance) renderChart(); });

    // Range sliders
    function wireRange(sliderId, badgeId, optKey, toVal, toLabel) {
        const slider = $(sliderId), badge = $(badgeId);
        if (!slider) return;
        slider.addEventListener('input', () => {
            opts[optKey] = toVal(Number(slider.value));
            if (badge) badge.textContent = toLabel(opts[optKey]);
            if (myChartInstance) renderChart();
        });
    }
    wireRange('optBarThickness', 'barThicknessVal', 'barThickness', v => v / 100,  v => Math.round(v * 100) + '%');
    wireRange('optTension',      'tensionVal',      'tension',      v => v / 10,   v => v.toFixed(1));
    wireRange('optPointSize',    'pointSizeVal',    'pointSize',    v => v,         v => v + 'px');
    wireRange('optCutout',       'cutoutVal',       'cutout',       v => v + '%',   v => v);

    // Y-axis min/max
    ['optYMin', 'optYMax'].forEach(id => {
        const el = $(id); if (!el) return;
        el.addEventListener('change', e => {
            opts[id === 'optYMin' ? 'yMin' : 'yMax'] = e.target.value;
            if (myChartInstance) renderChart();
        });
    });

    // File drop
    const fileDrop  = $('fileDrop');
    const fileInput = $('fileInput');
    const fileNameEl = $('fileName');
    fileDrop.addEventListener('click',     () => fileInput.click());
    fileDrop.addEventListener('dragover',  e  => { e.preventDefault(); fileDrop.classList.add('dragover'); });
    fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
    fileDrop.addEventListener('drop', e => {
        e.preventDefault(); fileDrop.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

    function handleFile(file) {
        fileNameEl.textContent = '⏳ Parsing ' + file.name + '…';
        fileNameEl.style.display = 'block';
        cachedCSV    = null;
        cachedRawCSV = null;
        parseCSV(file, (headers, rows) => {
            cachedRawCSV = { headers, rows };
            fileNameEl.textContent = '📄 ' + file.name + ' (' + rows.length + ' rows)';
            populateColumnSelector(headers, rows);
            showToast('✓ CSV loaded — select columns below');
        });
    }

    function populateColumnSelector(headers, rows) {
        const list = $('columnList');
        list.innerHTML = '';
        headers.forEach((h, i) => {
            const chip = document.createElement('div');
            chip.className = 'col-chip';
            chip.innerHTML = `<span class="col-num">${i + 1}</span><span class="col-name">${h}</span>`;
            list.appendChild(chip);
        });

        // Numeric-only fallback defaults
        const numericIdxs = headers.reduce((acc, h, i) => {
            if (rows.every(r => r[h] !== '' && !isNaN(Number(r[h])))) acc.push(i + 1);
            return acc;
        }, []);
        $('labelColInput').value = '1';
        $('dataColInput').value  = numericIdxs.length ? numericIdxs.join(', ') : '2';
        $('columnSelectorPanel').style.display = 'block';

        // Ask AI to suggest better column mapping
        const sampleRows = rows.slice(0, 3).map(r => headers.map(h => r[h]).join(', ')).join('\n');
        const prompt =
            `Given this CSV data, identify which column is best as a label/category axis and which columns contain numeric data worth visualizing.\n\n` +
            `Columns: ${headers.map((h, i) => `${i + 1}: ${h}`).join(', ')}\n` +
            `Sample rows:\n${sampleRows}\n\n` +
            `Reply in JSON only, no explanation:\n{"labelColumn": <number>, "dataColumns": [<numbers>]}`;

        askAI(prompt).then(result => {
            try {
                const json = JSON.parse(result.match(/\{[\s\S]*\}/)[0]);
                if (json.labelColumn) $('labelColInput').value = json.labelColumn;
                if (json.dataColumns?.length) $('dataColInput').value = json.dataColumns.join(', ');
                showToast('✨ AI suggested column mapping');
            } catch (_) { /* keep numeric fallback */ }
        }).catch(() => { /* keep fallback silently */ });
    }

    // Apply column selection from CSV
    $('applyColumnsBtn').addEventListener('click', () => {
        if (!cachedRawCSV) { showToast('⚠ Upload a CSV first.'); return; }
        const { headers, rows } = cachedRawCSV;

        const labelColNum = parseInt($('labelColInput').value.trim(), 10);
        if (isNaN(labelColNum) || labelColNum < 1 || labelColNum > headers.length) {
            showToast('⚠ Invalid label column number.'); return;
        }

        const dataColNums = $('dataColInput').value
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n >= 1 && n <= headers.length);
        if (!dataColNums.length) { showToast('⚠ No valid data columns selected.'); return; }

        const labelHeader = headers[labelColNum - 1];
        const dataHeaders = dataColNums.map(n => headers[n - 1]);

        cachedCSV = {
            labels:  rows.map(r => String(r[labelHeader] ?? 'Data')),
            values:  dataHeaders.map(col => rows.map(r => Number(r[col]))),
            headers: [labelHeader, ...dataHeaders],
        };
        showToast(`✓ ${dataColNums.length} column(s) selected — click Visualize`);
    });

    // Visualize
    $('visualizeBtn').addEventListener('click', () => {
        const dataStr  = $('dataInput').value.trim();
        const labelStr = $('labelInput').value.trim();

        if (!dataStr && !cachedCSV) { showToast('⚠ Enter data or upload a CSV, then apply columns.'); return; }

        if (dataStr) {
            const values = dataStr.split(',').map(s => s.trim()).filter(s => s !== '').map(s => Number(s)).filter(n => !isNaN(n));
            if (!values.length) { showToast('⚠ No valid numbers found.'); return; }
            const labels = labelStr
                ? labelStr.split(',').map(s => s.trim())
                : values.map((_, i) => `Item ${i + 1}`);
            currentLabels  = labels;
            currentValues  = [values];
            currentHeaders = ['Labels', 'Values'];
        } else {
            currentLabels  = cachedCSV.labels;
            currentValues  = cachedCSV.values;
            currentHeaders = cachedCSV.headers;
        }
        renderChart();
        updateStats(currentValues);
        updateDataTable(currentLabels, currentValues, currentHeaders);
        if (showTable) $('dataTableContainer').classList.add('visible');
        showToast('✓ Chart generated!');
    });

    // Clear
    $('clearBtn').addEventListener('click', () => {
        if (myChartInstance) { myChartInstance.destroy(); myChartInstance = null; }
        $('dataInput').value  = '';
        $('labelInput').value = '';
        fileInput.value       = '';
        cachedCSV             = null;
        cachedRawCSV          = null;
        fileNameEl.style.display = 'none';
        $('columnSelectorPanel').style.display = 'none';
        $('columnList').innerHTML = '';
        $('aiInsightsPanel').style.display = 'none';
        currentLabels = []; currentValues = [];
        $('myChart').style.display    = 'none';
        $('emptyState').style.display = '';
        $('statsBar').style.display   = 'none';
        $('dataTableBody').innerHTML  = '';
        $('dataTableContainer').classList.remove('visible');
        $('tableToggleBtn').classList.remove('active');
        showTable = false;
        showToast('✓ Cleared!');
    });

    // ── AI Insights ──
    $('aiInsightsBtn').addEventListener('click', async () => {
        if (!myChartInstance || !currentLabels.length) {
            showToast('⚠ Generate a chart first.'); return;
        }

        const panel  = $('aiInsightsPanel');
        const loader = $('aiInsightsLoader');
        const text   = $('aiInsightsText');

        panel.style.display = 'block';
        loader.style.display = 'flex';
        text.style.display   = 'none';
        text.textContent     = '';

        // Build a readable summary of the data for the prompt
        const seriesSummary = currentValues.map((vals, i) => {
            const name = currentHeaders[i + 1] || `Series ${i + 1}`;
            return `- ${name}: ${vals.join(', ')}`;
        }).join('\n');

        const prompt =
            `You are a data analyst. Analyze the following chart data and give 3 concise bullet-point insights about trends, peaks, dips, or comparisons. Be specific with numbers.\n\n` +
            `Chart type: ${selectedType}\n` +
            `Labels (${currentHeaders[0] || 'Category'}): ${currentLabels.join(', ')}\n` +
            `Data:\n${seriesSummary}\n\n` +
            `Respond with exactly 3 bullet points starting with •. No intro sentence.`;

        try {
            const result = await askAI(prompt);
            text.textContent   = result;
            loader.style.display = 'none';
            text.style.display   = 'block';
        } catch (err) {
            loader.style.display = 'none';
            text.textContent   = `⚠ ${err.message}`;
            text.style.display   = 'block';
            console.error(err);
        }
    });

    $('closeInsightsBtn').addEventListener('click', () => {
        $('aiInsightsPanel').style.display = 'none';
    });

    // Download PNG
    $('downloadBtn').addEventListener('click', () => {
        if (!myChartInstance) { showToast('⚠ No chart to download.'); return; }
        const a = document.createElement('a');
        a.download = 'chart.png';
        a.href = $('myChart').toDataURL('image/png');
        a.click();
        showToast('✓ Downloaded!');
    });

    // Fullscreen
    const chartArea = $('chartArea');
    $('fullscreenBtn').addEventListener('click', () => {
        chartArea.classList.add('fullscreen');
        $('exitFullscreenBtn').style.display = '';
        isFullscreen = true;
        if (myChartInstance) setTimeout(() => myChartInstance.resize(), 50);
    });
    $('exitFullscreenBtn').addEventListener('click', () => {
        chartArea.classList.remove('fullscreen');
        $('exitFullscreenBtn').style.display = 'none';
        isFullscreen = false;
        if (myChartInstance) setTimeout(() => myChartInstance.resize(), 50);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isFullscreen) $('exitFullscreenBtn').click(); });

    // Data table toggle
    $('tableToggleBtn').addEventListener('click', () => {
        showTable = !showTable;
        $('tableToggleBtn').classList.toggle('active', showTable);
        $('dataTableContainer').classList.toggle('visible', showTable && currentLabels.length > 0);
    });

    // ── Zoom controls ──
    const chartWrapper = document.querySelector('.chart-wrapper');

    function applyZoomCursor() {
        chartWrapper.className = 'chart-wrapper' + (zoomEnabled ? ' mode-' + zoomMode : '');
    }

    function setZoomMode(mode) {
        zoomMode = mode;
        // Reset all three buttons
        ['zoomWheel', 'zoomBox', 'zoomPan'].forEach(id => {
            const b = $(id);
            if (!b) return;
            b.classList.remove('active');
            b.style.cssText = '';
        });
        // Highlight active one
        $(mode === 'wheel' ? 'zoomWheel' : mode === 'box' ? 'zoomBox' : 'zoomPan').classList.add('active');
        applyZoomCursor();
        if (myChartInstance) renderChart();
    }

    function showZoomHint(msg) {
        const old = chartWrapper.querySelector('.zoom-hint');
        if (old) old.remove();
        const hint = document.createElement('div');
        hint.className   = 'zoom-hint';
        hint.textContent = msg;
        chartWrapper.appendChild(hint);
        setTimeout(() => hint.classList.add('fade'), 2200);
        setTimeout(() => { try { hint.remove(); } catch(_){} }, 3300);
    }

    $('zoomToggleBtn').addEventListener('click', () => {
        zoomEnabled = !zoomEnabled;
        $('zoomToggleBtn').classList.toggle('active', zoomEnabled);
        $('zoomModeGroup').style.display = zoomEnabled ? 'flex' : 'none';
        if (zoomEnabled) {
            setZoomMode(zoomMode); // ensures correct button is highlighted
            showZoomHint({ wheel: '🖱 Scroll to zoom', box: '⬚ Drag to select region', pan: '✥ Drag to pan' }[zoomMode]);
            showToast('✓ Zoom enabled');
        } else {
            applyZoomCursor();
            showToast('Zoom disabled');
        }
        if (myChartInstance) renderChart();
    });

    $('zoomWheel').addEventListener('click', () => setZoomMode('wheel'));
    $('zoomBox').addEventListener('click',   () => setZoomMode('box'));
    $('zoomPan').addEventListener('click',   () => setZoomMode('pan'));

    $('resetZoomBtn').addEventListener('click', () => {
        if (myChartInstance && typeof myChartInstance.resetZoom === 'function') {
            myChartInstance.resetZoom();
            showToast('✓ Zoom reset');
        } else {
            showToast('⚠ Nothing to reset');
        }
    });

}); // window load