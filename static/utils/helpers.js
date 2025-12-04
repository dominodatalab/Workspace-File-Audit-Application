// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

import { CONFIG } from "../config.js";
import { state } from "../state.js";

// Helper function to get human-readable label for a column
export function getColumnLabel(column) {
  // Priority: backend-provided labels > CONFIG labels > formatted column name
  return (
    state.columnLabels[column] ||
    CONFIG.columnLabels[column] ||
    column.replace(/([A-Z])/g, " $1").trim()
  );
}

// Helper function to detect if a string is a regex pattern (wrapped in /)
export function isRegexPattern(str) {
  return typeof str === "string" && str.startsWith("/") && str.length > 1;
}

// Helper function to extract regex pattern from /pattern/ format
export function extractRegexPattern(str) {
  if (isRegexPattern(str)) {
    // Remove leading slash
    return str.substring(1);
  }
  return str;
}

// Helper function to validate regex pattern
export function isValidRegex(pattern) {
  try {
    new RegExp(extractRegexPattern(pattern));
    return true;
  } catch (e) {
    return false;
  }
}

// Helper function to clean empty filter arrays
export function cleanFilters(filters) {
  const cleaned = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value && value.length > 0) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// Helper function to highlight matching text
export function highlightText(text, query) {
  if (!query) return text;

  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi"
  );
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      return React.createElement(
        "span",
        { key: index, className: "highlight" },
        part
      );
    }
    return part;
  });
}

// Helper function to extract filename from path
export function getFilename(path) {
  if (!path || typeof path !== "string") return path;
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}
