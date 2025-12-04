// ============================================================================
// FIELD SELECTOR COMPONENT
// ============================================================================

import { CONFIG } from "../config.js";
import { state } from "../state.js";
import { getColumnLabel } from "../utils/helpers.js";
import { updateChart } from "./Chart.js";

// Render field selector
export function renderFieldSelector() {
  const container = document.getElementById("chart-field-selector");
  const { Select } = antd;
  const { useState, useEffect } = React;

  // Get available fields (exclude certain columns)
  const availableFields = Object.keys(state.columns).filter(
    (col) => !CONFIG.fieldSelectorExcludeColumns.includes(col)
  );

  const options = [
    { label: "None", value: null },
    ...availableFields.map((field) => ({
      label: getColumnLabel(field),
      value: field,
    })),
  ];

  // Create a React component with state to properly track the selected value
  const FieldSelector = () => {
    const [selectedValue, setSelectedValue] = useState(state.selectedField);

    // Sync with global state changes
    useEffect(() => {
      setSelectedValue(state.selectedField);
    }, [state.selectedField]);

    return React.createElement(Select, {
      style: { width: 200 },
      placeholder: "Select field",
      options: options,
      value: selectedValue,
      onChange: (value) => {
        setSelectedValue(value);
        state.selectedField = value;
        updateChart();
      },
    });
  };

  ReactDOM.render(React.createElement(FieldSelector), container);
}
