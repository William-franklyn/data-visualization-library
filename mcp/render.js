'use strict';

const QUICKCHART_URL = 'https://quickchart.io/chart';

async function renderChartImage(chartConfig, { width = 800, height = 500, backgroundColor = 'white' } = {}) {
  const res = await fetch(QUICKCHART_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chart: chartConfig,
      width,
      height,
      backgroundColor,
      format: 'png',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`QuickChart render failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const params = new URLSearchParams({ c: JSON.stringify(chartConfig), w: String(width), h: String(height), bkg: backgroundColor });

  return {
    imageBase64: buffer.toString('base64'),
    mimeType: 'image/png',
    url: `${QUICKCHART_URL}?${params.toString()}`,
  };
}

module.exports = { renderChartImage };
