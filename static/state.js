// ============================================================================
// BASE PATH & STATE
// ============================================================================

import { CONFIG } from "./config.js";

// Determine the base path for API calls (handles Domino proxy paths)
function getBasePath() {
  const path = window.location.pathname;
  // If we're in a Domino app (path contains /apps/), extract the base path
  if (path.includes("/apps/")) {
    // Extract everything up to and including the app ID
    const match = path.match(/^(\/apps\/[^\/]+)/);
    return match ? match[1] : "";
  }
  return "";
}

export const BASE_PATH = getBasePath();

// Load user's hidden-column preferences from localStorage
function loadHiddenColumns() {
  try {
    const stored = localStorage.getItem("domino.auditApp.hiddenColumns");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    // Ignore malformed/unavailable storage
  }
  return [...(CONFIG.defaultHiddenColumns || [])];
}

// Persist the user's hidden-column preferences to localStorage
export function saveHiddenColumns() {
  try {
    localStorage.setItem(
      "domino.auditApp.hiddenColumns",
      JSON.stringify(state.hiddenColumns)
    );
  } catch (e) {
  }
}

export const state = {
  data: [],
  filteredData: [],
  chartData: [], // Separate data for chart (not paginated)
  columns: {},
  availableColumns: {}, // Dynamically scoped columns based on current filters
  columnLabels: {}, // Human-readable column labels from backend
  filters: {},
  substringFilters: {}, // Store substring (LIKE) filters separately
  regexFilters: {}, // Store regex filters separately
  currentPage: 1,
  pageSize: CONFIG.pageSize,
  dateRange: null,
  selectedField: null, // Field to split time series by
  sortColumn: CONFIG.defaultSortColumn,
  sortOrder: CONFIG.defaultSortOrder,
  lastSyncTime: null,
  lastSyncStatus: null,
  hiddenColumns: loadHiddenColumns(), // Columns the user has toggled off
};
