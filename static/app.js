// ============================================================================
// MAIN APPLICATION ENTRY POINT
// ============================================================================

import { initializeDateRange } from "./components/DateRangePicker.js";
import { renderPlaceholderFilters } from "./components/Filters.js";
import { renderSyncButton } from "./components/SyncButton.js";
import { executeSqlQuery, downloadCSV, downloadParquet, loadSyncStatus } from "./services/api.js";

// Event listeners
document
  .getElementById("execute-sql-btn")
  .addEventListener("click", executeSqlQuery);
document
  .getElementById("download-csv-btn")
  .addEventListener("click", downloadCSV);
document
  .getElementById("download-parquet-btn")
  .addEventListener("click", downloadParquet);

// Initialize dayjs plugins
dayjs.extend(dayjs_plugin_customParseFormat);
dayjs.extend(dayjs_plugin_weekday);
dayjs.extend(dayjs_plugin_localeData);
dayjs.extend(dayjs_plugin_weekOfYear);
dayjs.extend(dayjs_plugin_weekYear);
dayjs.extend(dayjs_plugin_advancedFormat);

// Initialize the application
initializeDateRange();
renderPlaceholderFilters();
renderSyncButton();
loadSyncStatus();
// User must click Submit to load data

const pollingInterval = 60000; // milliseconds

// Start the polling
const intervalId = setInterval(loadSyncStatus, pollingInterval);