// ============================================================================
// CHART HELPER FUNCTIONS
// ============================================================================

// Helper function to determine bucket size based on date range
export function determineTimeBucket(dateRange) {
  if (!dateRange || dateRange.length < 2) return "day";

  const days = dateRange[1].diff(dateRange[0], "days");

  if (days <= 1) return "hour";
  if (days <= 7) return "day";
  if (days <= 60) return "day";
  if (days <= 365) return "week";
  return "month";
}

// Helper function to bucket timestamps
export function bucketTimestamp(timestamp, bucket) {
  const date = dayjs.utc(timestamp);

  switch (bucket) {
    case "hour":
      return date.format("YYYY-MM-DD HH:00");
    case "day":
      return date.format("YYYY-MM-DD");
    case "week":
      return date.startOf("week").format("YYYY-MM-DD");
    case "month":
      return date.format("YYYY-MM");
    default:
      return date.format("YYYY-MM-DD");
  }
}

// Helper function to get top N values and group others
export function getTopNValues(data, field, n = 10) {
  const counts = {};
  data.forEach((event) => {
    const value = event[field] || "Unknown";
    counts[value] = (counts[value] || 0) + 1;
  });

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value);

  const topN = sorted.slice(0, n);
  return topN;
}

// Helper function to generate all time buckets within a date range
export function generateTimeBuckets(startDate, endDate, bucket) {
  const buckets = [];
  let current = dayjs.utc(startDate).startOf('day');
  const end = dayjs.utc(endDate).endOf('day');

  while (current.isBefore(end) || current.isSame(end, bucket)) {
    buckets.push(bucketTimestamp(current.toISOString(), bucket));

    // Increment based on bucket type
    switch (bucket) {
      case "hour":
        current = current.add(1, "hour");
        break;
      case "day":
        current = current.add(1, "day");
        break;
      case "week":
        current = current.add(1, "week");
        break;
      case "month":
        current = current.add(1, "month");
        break;
      default:
        current = current.add(1, "day");
    }
  }

  return buckets;
}
