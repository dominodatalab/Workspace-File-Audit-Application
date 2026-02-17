// ============================================================================
// API SERVICE
// ============================================================================

import { state, BASE_PATH } from "../state.js";
import { cleanFilters } from "../utils/helpers.js";
import { showLoading, showError, clearError } from "../utils/ui.js";
import { renderFilters } from "../components/Filters.js";
import { renderFieldSelector } from "../components/FieldSelector.js";
import { renderSyncData } from "../components/SyncButton.js";
import { updateChart } from "../components/Chart.js";
import { updateTable } from "../components/Table.js";

export async function loadData() {
  if (!state.dateRange || !state.dateRange[0] || !state.dateRange[1]) {
    showError("Please select a date range");
    return;
  }

  showLoading(true);
  try {
    const startDate = state.dateRange[0].format("YYYY-MM-DD");
    const endDate = state.dateRange[1].format("YYYY-MM-DD");

    const response = await fetch(
      `${BASE_PATH}/api/data?start=${startDate}&end=${endDate}`
    );
    const result = await response.json();

    if (response.ok) {
      state.data = result.data;
      state.filteredData = result.data;
      state.chartData = result.data;

      await loadColumns();
      renderFilters();
      renderFieldSelector();

      document.getElementById("chart-container").classList.remove("hidden");
      document
        .getElementById("table-container-wrapper")
        .classList.remove("hidden");

      state.currentPage = 1;
      await applyFilters(false);

      clearError();
    } else {
      showError(result.error || "Failed to load data");
    }
  } catch (error) {
    showError("Error loading data: " + error.message);
  } finally {
    showLoading(false);
  }
}

export async function loadColumns() {
  try {
    const response = await fetch(`${BASE_PATH}/api/columns`);
    const result = await response.json();

    if (response.ok) {
      state.columns = result.columns;
      state.availableColumns = result.columns;
      state.columnLabels = result.columnLabels || {};
    } else {
      console.error("Failed to load columns:", result);
      showError(
        "Failed to load column metadata: " + (result.error || "Unknown error")
      );
    }
  } catch (error) {
    console.error("Error loading columns:", error);
    showError("Error loading column metadata: " + error.message);
  }
}

export async function loadAvailableColumns() {
  try {
    const cleanedFilters = cleanFilters(state.filters);
    const cleanedSubstringFilters = cleanFilters(state.substringFilters);
    const cleanedRegexFilters = cleanFilters(state.regexFilters);

    const response = await fetch(`${BASE_PATH}/api/filtered-columns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: cleanedFilters,
        substringFilters: cleanedSubstringFilters,
        regexFilters: cleanedRegexFilters,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      state.availableColumns = result.columns;
      renderFilters();
    }
  } catch (error) {
    console.error("Error loading available columns:", error);
  }
}

export async function applyFilters(resetPage = false) {
  if (resetPage) {
    state.currentPage = 1;
  }

  const cleanedFilters = cleanFilters(state.filters);
  const cleanedSubstringFilters = cleanFilters(state.substringFilters);
  const cleanedRegexFilters = cleanFilters(state.regexFilters);

  showLoading(true);
  try {
    const requestBody = {
      filters: cleanedFilters,
      substringFilters: cleanedSubstringFilters,
      regexFilters: cleanedRegexFilters,
      page: state.currentPage,
      pageSize: state.pageSize,
      sortColumn: state.sortColumn,
      sortOrder: state.sortOrder,
    };

    const response = await fetch(`${BASE_PATH}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();

    if (response.ok) {
      const maxPage = Math.max(1, Math.ceil(result.total / state.pageSize));
      if (state.currentPage > maxPage) {
        state.currentPage = 1;
        applyFilters(false);
        return;
      }

      if (
        (!result.data || result.data.length === 0) &&
        result.chartData &&
        result.chartData.length > 0 &&
        result.total > 0
      ) {
        state.currentPage = 1;
        applyFilters(false);
        return;
      }

      state.filteredData = result.data || [];
      state.chartData = result.chartData || result.data || [];
      updateChart();
      updateTable(result.total);

      if (resetPage) {
        await loadAvailableColumns();
      }
    } else {
      showError(result.error || "Failed to apply filters");
    }
  } catch (error) {
    showError("Error applying filters: " + error.message);
  } finally {
    showLoading(false);
  }
}

export async function loadSyncStatus() {
  try {
    const response = await fetch(`${BASE_PATH}/api/sync/status`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (response.ok) {
      state.lastSyncTime = result.updatedAt;
      state.lastSyncStatus = result.status;
      renderSyncData();
      clearError();
    } else {
      console.error("Failed to load sync status:", result.error);
    }
  } catch (error) {
    console.error("Error loading sync status:", error);
  }
}

export async function syncData() {
  showLoading(true);
  try {
    const response = await fetch(`${BASE_PATH}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const result = await response.json();

    if (response.ok) {
      loadSyncStatus();
      clearError();
    } else {
      showError(result.error || "Failed to sync data");
    }
  } catch (error) {
    showError("Error syncing data: " + error.message);
  } finally {
    showLoading(false);
  }
}

export async function executeSqlQuery() {
  const sqlQuery = document.getElementById("sql-query").value;
  if (!sqlQuery.trim()) {
    showError("Please enter a SQL query");
    return;
  }

  showLoading(true);
  try {
    const response = await fetch(`${BASE_PATH}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: sqlQuery,
        page: state.currentPage,
        pageSize: state.pageSize,
      }),
    });

    const result = await response.json();

    if (response.ok) {
      state.filteredData = result.data;
      state.chartData = result.chartData || result.data;
      updateChart();
      updateTable(result.total);
      clearError();
    } else {
      showError(result.error || "Failed to execute query");
    }
  } catch (error) {
    showError("Error executing query: " + error.message);
  } finally {
    showLoading(false);
  }
}

export async function downloadCSV() {
  showLoading(true);
  try {
    const response = await fetch(`${BASE_PATH}/api/download/csv`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: cleanFilters(state.filters),
        substringFilters: cleanFilters(state.substringFilters),
        regexFilters: cleanFilters(state.regexFilters),
      }),
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "workspace_audit_events.csv";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(
          /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
        );
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, "");
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      clearError();
    } else {
      const result = await response.json();
      showError(result.error || "Failed to download CSV");
    }
  } catch (error) {
    showError("Error downloading CSV: " + error.message);
  } finally {
    showLoading(false);
  }
}

export async function downloadParquet() {
  showLoading(true);
  try {
    const response = await fetch(`${BASE_PATH}/api/download/parquet`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: cleanFilters(state.filters),
        substringFilters: cleanFilters(state.substringFilters),
        regexFilters: cleanFilters(state.regexFilters),
      }),
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "workspace_audit_events.parquet";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(
          /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/
        );
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, "");
        }
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      clearError();
    } else {
      const result = await response.json();
      showError(result.error || "Failed to download Parquet");
    }
  } catch (error) {
    showError("Error downloading Parquet: " + error.message);
  } finally {
    showLoading(false);
  }
}
