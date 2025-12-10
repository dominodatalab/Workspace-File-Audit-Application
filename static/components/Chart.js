// ============================================================================
// CHART COMPONENT
// ============================================================================

import { CONFIG } from "../config.js";
import { state } from "../state.js";
import {
  determineTimeBucket,
  bucketTimestamp,
  getTopNValues,
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
    xAxis: {
      type: "datetime",
      title: {
        text: "Time",
      },
      min: state.dateRange[0].valueOf(),
      max: state.dateRange[1].valueOf(),
    },
    yAxis: {
      title: {
        text: "Number of Events",
      },
    },
    plotOptions: {
      column: {
        borderWidth: 0,
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

// Update chart
export function updateChart() {
  if (!state.dateRange || !state.dateRange[0] || !state.dateRange[1]) {
    document.getElementById("chart").innerHTML =
      '<p style="text-align: center; padding: 20px; color: #65657b;">No data available</p>';
    return;
  }

  const bucket = determineTimeBucket(state.dateRange);

  // Generate all time buckets for the full date range (fixed x-axis)
  const allTimeBuckets = generateTimeBuckets(
    state.dateRange[0],
    state.dateRange[1],
    bucket
  );

  // Create time series data
  const timeSeriesData = {};

  // Initialize all buckets with 0
  allTimeBuckets.forEach((bucket) => {
    timeSeriesData[bucket] = 0;
  });

  if (!state.selectedField) {
    // Simple time series - just count events per time bucket
    if (state.chartData && state.chartData.length > 0) {
      state.chartData.forEach((event) => {
        const timeBucket = bucketTimestamp(event.timestamp, bucket);
        timeSeriesData[timeBucket] = (timeSeriesData[timeBucket] || 0) + 1;
      });
    }

    // Use all time buckets (from date range) sorted
    const sortedTimes = allTimeBuckets.sort();
    const chartData = sortedTimes.map((time) => ({
      x: new Date(time).getTime(),
      y: timeSeriesData[time],
    }));

    const chartConfig = {
      ...getBaseChartConfig(),
      series: [
        {
          name: "Events",
          data: chartData,
        },
      ],
    };

    Highcharts.chart("chart", chartConfig);
  } else {
    // Stacked area chart by field
    const topValues =
      state.chartData && state.chartData.length > 0
        ? getTopNValues(state.chartData, state.selectedField, CONFIG.chart.topNValues)
        : [];

    // Initialize time series for each top value and "Other"
    const seriesData = {};
    topValues.forEach((value) => {
      seriesData[value] = {};
      // Initialize all buckets with 0 for each series
      allTimeBuckets.forEach((bucket) => {
        seriesData[value][bucket] = 0;
      });
    });
    seriesData["Other"] = {};
    allTimeBuckets.forEach((bucket) => {
      seriesData["Other"][bucket] = 0;
    });

    // Aggregate data
    if (state.chartData && state.chartData.length > 0) {
      state.chartData.forEach((event) => {
        const timeBucket = bucketTimestamp(event.timestamp, bucket);
        const fieldValue = event[state.selectedField] || "Unknown";
        const seriesKey = topValues.includes(fieldValue) ? fieldValue : "Other";

        seriesData[seriesKey][timeBucket] =
          (seriesData[seriesKey][timeBucket] || 0) + 1;
      });
    }

    // Use all time buckets (from date range) sorted
    const sortedTimes = allTimeBuckets.sort();

    // Convert to Highcharts series format
    const series = [];

    // Add top values first
    topValues.forEach((value) => {
      const data = sortedTimes.map((time) => ({
        x: new Date(time).getTime(),
        y: seriesData[value][time] || 0,
      }));
      series.push({
        name: value,
        data: data,
      });
    });

    // Add "Other" if there are more than topNValues unique values
    const totalUniqueValues =
      state.chartData && state.chartData.length > 0
        ? new Set(
            state.chartData.map((e) => e[state.selectedField] || "Unknown")
          ).size
        : 0;
    if (totalUniqueValues > CONFIG.chart.topNValues) {
      const data = sortedTimes.map((time) => ({
        x: new Date(time).getTime(),
        y: seriesData["Other"][time] || 0,
      }));
      series.push({
        name: "Other",
        data: data,
        color: "#cccccc",
      });
    }

    const chartConfig = {
      ...getBaseChartConfig("column", { stacking: "normal" }),
      series: series,
    };

    Highcharts.chart("chart", chartConfig);
  }
}
