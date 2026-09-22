/* global window */
(() => {
  "use strict";

  const charts = new Map();
  const palette = [
    "#2f8cff",
    "#5bd35b",
    "#ef565b",
    "#f6a623",
    "#8b72f6",
    "#53b7ef",
    "#8bd52f",
    "#e74ca8",
  ];

  function setup(canvas) {
    const width = Math.max(
      280,
      canvas.clientWidth || canvas.parentElement?.clientWidth || 600,
    );
    const height = Number(canvas.dataset.height || 250);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  function axisValue(value, maximum) {
    if (maximum <= 4) {
      return value
        .toFixed(2)
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1");
    }
    return Math.round(value).toLocaleString();
  }

  function frame(context, width, height, maximum) {
    const area = { left: 42, top: 14, right: width - 12, bottom: height - 28 };
    context.clearRect(0, 0, width, height);
    context.font = "11px system-ui";
    context.strokeStyle = "rgba(148,163,184,.15)";
    context.fillStyle = "#7f93a7";
    context.lineWidth = 1;
    for (let index = 0; index <= 4; index += 1) {
      const y = area.top + ((area.bottom - area.top) * index) / 4;
      context.beginPath();
      context.moveTo(area.left, y);
      context.lineTo(area.right, y);
      context.stroke();
      const value = maximum * (1 - index / 4);
      context.fillText(axisValue(value, maximum), 4, y + 4);
    }
    return area;
  }

  function labels(context, area, labelsList) {
    if (!labelsList.length) return;
    const steps = Math.min(5, labelsList.length);
    context.fillStyle = "#7f93a7";
    for (let index = 0; index < steps; index += 1) {
      const sourceIndex = Math.round(
        (labelsList.length - 1) * (index / Math.max(1, steps - 1)),
      );
      const x =
        area.left +
        (area.right - area.left) *
          (sourceIndex / Math.max(1, labelsList.length - 1));
      context.textAlign =
        index === 0 ? "left" : index === steps - 1 ? "right" : "center";
      context.fillText(labelsList[sourceIndex] || "", x, area.bottom + 20);
    }
    context.textAlign = "start";
  }

  function drawLine(canvas, config) {
    const { context, width, height } = setup(canvas);
    const all = config.series.flatMap((series) => series.values.map(Number));
    const maximum = Math.max(1, ...all);
    const area = frame(context, width, height, maximum);
    labels(context, area, config.labels);
    for (const [seriesIndex, series] of config.series.entries()) {
      context.beginPath();
      context.strokeStyle =
        series.color || palette[seriesIndex % palette.length];
      context.lineWidth = 2;
      series.values.forEach((raw, index) => {
        const x =
          area.left +
          (area.right - area.left) *
            (index / Math.max(1, config.labels.length - 1));
        const y =
          area.bottom - (area.bottom - area.top) * (Number(raw) / maximum);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  }

  function drawBars(canvas, config) {
    const { context, width, height } = setup(canvas);
    const totals = config.labels.map((_, index) =>
      config.series.reduce(
        (sum, series) => sum + Number(series.values[index] || 0),
        0,
      ),
    );
    const maximum = Math.max(1, ...totals);
    const area = frame(context, width, height, maximum);
    labels(context, area, config.labels);
    const slot = (area.right - area.left) / Math.max(1, config.labels.length);
    const barWidth = Math.max(2, slot * 0.72);
    config.labels.forEach((_, index) => {
      let bottom = area.bottom;
      config.series.forEach((series, seriesIndex) => {
        const value = Number(series.values[index] || 0);
        const barHeight = (area.bottom - area.top) * (value / maximum);
        context.fillStyle =
          series.color || palette[seriesIndex % palette.length];
        context.fillRect(
          area.left + index * slot + (slot - barWidth) / 2,
          bottom - barHeight,
          barWidth,
          barHeight,
        );
        bottom -= barHeight;
      });
    });
  }

  function render(canvas, type, config) {
    if (!canvas) return;
    charts.set(canvas, { type, config });
    if (type === "bars") drawBars(canvas, config);
    else drawLine(canvas, config);
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      charts.forEach(({ type, config }, canvas) =>
        render(canvas, type, config),
      );
    }, 120);
  });

  window.AlexaCharts = { palette, render };
})();
