// ============================================================================
// MAIN APPLICATION ENTRY POINT
// ============================================================================

import { initializeDateRange } from "./components/DateRangePicker.js";
import { renderPlaceholderFilters } from "./components/Filters.js";
import {
  executeSqlQuery,
  downloadCSV,
  downloadParquet,
  loadSyncStatus,
  loadData,
} from "./services/api.js";

document
  .getElementById("execute-sql-btn")
  .addEventListener("click", executeSqlQuery);
document
  .getElementById("download-csv-btn")
  .addEventListener("click", downloadCSV);
document
  .getElementById("download-parquet-btn")
  .addEventListener("click", downloadParquet);

const infoBannerCloseBtn = document.getElementById("info-banner-close");
if (infoBannerCloseBtn) {
  infoBannerCloseBtn.addEventListener("click", () => {
    const banner = document.getElementById("info-banner");
    if (banner) {
      banner.classList.add("hidden");
      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        mainContent.style.height = "calc(100vh - 44px)";
      }
    }
  });
}

dayjs.extend(dayjs_plugin_customParseFormat);
dayjs.extend(dayjs_plugin_weekday);
dayjs.extend(dayjs_plugin_localeData);
dayjs.extend(dayjs_plugin_weekOfYear);
dayjs.extend(dayjs_plugin_weekYear);
dayjs.extend(dayjs_plugin_advancedFormat);

initializeDateRange();
renderPlaceholderFilters();
loadSyncStatus();
loadData();

const pollingInterval = 60000;
setInterval(loadSyncStatus, pollingInterval);

window.addEventListener("beforeunload", () => {
  clearError();
});
