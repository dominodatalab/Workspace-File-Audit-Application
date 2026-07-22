// ============================================================================
// CHART COMPONENT
// ============================================================================

import { CONFIG } from "../config.js";
import { state } from "../state.js";
import {
  determineTimeBucket,
  bucketTimestamp,
  generateTimeBuckets,
} from "../utils/chartHelpers.js";

// Helper to create base chart configuration
function getBaseChartConfig(chartType = "column", additionalPlotOptions = {}) {
  return {
    chart: {
      type: chartType,
    },
    title: {
      text: null,
    },
    time: {
      useUTC: true,
    },
    xAxis: {
      type: "datetime",
      title: {
        text: "Time (UTC)",
      },
      min: dayjs.utc(state.dateRange[0]).startOf("day").valueOf(),
      max: dayjs.utc(state.dateRange[1]).endOf("day").valueOf(),
    },
    yAxis: {
      title: {
        text: "Number of Events",
      },
      min: 0,
    },
    plotOptions: {
      column: {
        borderWidth: 0,
        pointPadding: 0,
        groupPadding: 0.1,
        ...additionalPlotOptions,
      },
    },
    credits: {
      enabled: false,
    },
    tooltip: {
      shared: true,
    },
  };
}

// Update chart using pre-aggregated data from backend
export function updateChart() {
  if (!state.dateRange || !state.dateRange[0] || !state.dateRange[1]) {
    document.getElementById("chart").innerHTML =
      '<p style="text-align: center; padding: 20px; color: #65657b;">No data available</p>';
    return;
  }

  const chartData = state.chartData;

  // Support both pre-aggregated format {bucketSize, selectedField, data:[...]}
  // and legacy raw-rows array format (fallback)
  const isAggregated =
    chartData &&
    !Array.isArray(chartData) &&
    chartData.data !== undefined;

  if (!isAggregated) {
    // Legacy path — should not happen after this change, but guard just in case
    document.getElementById("chart").innerHTML =
      '<p style="text-align: center; padding: 20px; color: #65657b;">No data available</p>';
    return;
  }

  const bucketSize = chartData.bucketSize || determineTimeBucket(state.dateRange);
  const rows = chartData.data || [];
  const allTimeBuckets = generateTimeBuckets(
    state.dateRange[0],
    state.dateRange[1],
    bucketSize
  );

  if (!chartData.selectedField) {
    // Simple time series — rows are [{time_bucket, count}]
    const timeSeriesData = {};
    allTimeBuckets.forEach((b) => { timeSeriesData[b] = 0; });

    rows.forEach((row) => {
      const tb = bucketTimestamp(row.time_bucket, bucketSize);
      timeSeriesData[tb] = (timeSeriesData[tb] || 0) + row.count;
    });

    const sortedTimes = allTimeBuckets.sort();
    const seriesData = sortedTimes.map((time) => ({
      x: dayjs.utc(time).valueOf(),
      y: timeSeriesData[time] || 0,
    }));

    Highcharts.chart("chart", {
      ...getBaseChartConfig(),
      series: [{ name: "Events", data: seriesData }],
    });
  } else {
    // Stacked chart by field — rows are [{time_bucket, field_value, count}]
    const fieldValues = [
      ...new Set(rows.filter((r) => r.field_value !== "Other").map((r) => r.field_value)),
    ];
    const hasOther = rows.some((r) => r.field_value === "Other");

    const seriesMap = {};
    [...fieldValues, ...(hasOther ? ["Other"] : [])].forEach((v) => {
      seriesMap[v] = {};
      allTimeBuckets.forEach((b) => { seriesMap[v][b] = 0; });
    });

    rows.forEach((row) => {
      const tb = bucketTimestamp(row.time_bucket, bucketSize);
      const fv = row.field_value || "Other";
      if (seriesMap[fv]) {
        seriesMap[fv][tb] = (seriesMap[fv][tb] || 0) + row.count;
      }
    });

    const sortedTimes = allTimeBuckets.sort();
    const series = fieldValues.map((value) => ({
      name: value,
      data: sortedTimes.map((time) => ({
        x: dayjs.utc(time).valueOf(),
        y: seriesMap[value][time] || 0,
      })),
    }));

    if (hasOther) {
      series.push({
        name: "Other",
        data: sortedTimes.map((time) => ({
          x: dayjs.utc(time).valueOf(),
          y: seriesMap["Other"][time] || 0,
        })),
        color: "#cccccc",
      });
    }

    Highcharts.chart("chart", {
      ...getBaseChartConfig("column", { stacking: "normal" }),
      series: series,
    });
  }
}
