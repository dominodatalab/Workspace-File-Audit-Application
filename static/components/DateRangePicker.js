// ============================================================================
// DATE RANGE PICKER COMPONENT
// ============================================================================

import { state } from "../state.js";
import { loadData } from "../services/api.js";
import { showError } from "../utils/ui.js";

// Initialize with default date range (last 30 days)
export function initializeDateRange() {
  const endDate = dayjs();
  const startDate = dayjs().subtract(30, "days");
  state.dateRange = [startDate, endDate];
  renderDateRangePicker();
}

// Render Date Range Picker using Ant Design
export function renderDateRangePicker() {
  const { RangePicker } = antd.DatePicker;
  const { Button } = antd;

  const container = document.getElementById("date-range-picker");
  ReactDOM.render(
    React.createElement(
      "div",
      { style: { display: "flex", gap: "8px", alignItems: "center" } },
      [
        React.createElement(RangePicker, {
          key: "picker",
          value: state.dateRange,
          onChange: (dates) => {
            state.dateRange = dates;
            // Re-render to update the component with the new value
            renderDateRangePicker();
          },
          format: "YYYY-MM-DD",
        }),
        React.createElement(
          Button,
          {
            key: "submit",
            type: "primary",
            onClick: () => {
              if (state.dateRange && state.dateRange[0] && state.dateRange[1]) {
                loadData();
              } else {
                showError("Please select a date range");
              }
            },
          },
          "Submit"
        ),
      ]
    ),
    container
  );
}
