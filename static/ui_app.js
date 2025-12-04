// ============================================================================
// CONFIGURATION
// ============================================================================

// Application configuration
const CONFIG = {
  // Default pagination settings
  pageSize: 20,
  defaultSortColumn: "timestamp",
  defaultSortOrder: "DESC",
  defaultDateRangeDays: 30,

  // Columns to exclude from all filters
  excludeColumns: [
    "uuid",
    "deduplicationId",
    "timestamp",
    "projectId",
    "userId",
    "workspaceName",
    "environmentName",
    "hardwareTierId",
  ],

  // Columns to hide from table display
  hiddenTableColumns: ["userId", "uuid", "deduplicationId"],

  // Filter sections configuration
  filterSections: {
    section1: [
      "action",
      "username",
      "projectName",
      "workspaceName",
      "filename",
    ],
    section2: ["environmentName", "hardwareTierId"],
  },

  // Human-readable column labels (matches backend COLUMN_NAME_MAPPING)
  // Used for placeholder filters before data loads
  columnLabels: {
    timestamp: "Timestamp",
    username: "Username",
    action: "Event",
    filename: "File path",
    projectName: "Project Name",
    workspaceName: "Workspace Name",
    environmentName: "Environment Name",
    hardwareTierId: "Hardware Tier",
    projectId: "Project ID",
    userId: "User ID",
    uuid: "UUID",
    deduplicationId: "Deduplication ID",
  },

  // Table column display order
  tableColumnOrder: [
    "timestamp",
    "username",
    "action",
    "filename",
    "projectName",
    "workspaceName",
    "environmentName",
    "hardwareTierId",
    "projectId",
  ],

  // Chart settings
  chart: {
    topNValues: 10, // Number of top values to show in breakdown chart
    listHeight: 256, // Dropdown list height
  },
};

// ============================================================================
// BASE PATH & STATE
// ============================================================================

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

const BASE_PATH = getBasePath();

// Global state
const state = {
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
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Helper function to get human-readable label for a column
function getColumnLabel(column) {
  // Priority: backend-provided labels > CONFIG labels > formatted column name
  return (
    state.columnLabels[column] ||
    CONFIG.columnLabels[column] ||
    column.replace(/([A-Z])/g, " $1").trim()
  );
}

// Helper function to detect if a string is a regex pattern (wrapped in /)
function isRegexPattern(str) {
  return typeof str === "string" && str.startsWith("/") && str.length > 1;
}

// Helper function to extract regex pattern from /pattern/ format
function extractRegexPattern(str) {
  if (isRegexPattern(str)) {
    // Remove leading slash
    return str.substring(1);
  }
  return str;
}

// Helper function to validate regex pattern
function isValidRegex(pattern) {
  try {
    new RegExp(extractRegexPattern(pattern));
    return true;
  } catch (e) {
    return false;
  }
}

// Helper function to clean empty filter arrays
function cleanFilters(filters) {
  const cleaned = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value && value.length > 0) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// Render Sync Button using Ant Design
function renderSyncButton() {
  const { Button } = antd;
  const container = document.getElementById("sync-controls");
  ReactDOM.render(
    React.createElement(
      Button,
      {
        key: "sync",
        type: "primary",
        onClick: () => {
          syncData();
        },
      },
      "Sync Data"
    ),
    container
  );
}

// Initialize with default date range (last 30 days)
function initializeDateRange() {
  const endDate = dayjs();
  const startDate = dayjs().subtract(30, "days");
  state.dateRange = [startDate, endDate];
  renderDateRangePicker();
}

// Render Date Range Picker using Ant Design
function renderDateRangePicker() {
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

// Load data from server
async function loadData() {
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
      state.chartData = result.data; // Initially, chart data is same as all data

      // Load column metadata
      await loadColumns();

      // Render filters and field selector
      renderFilters();
      renderFieldSelector();

      // Show chart and table containers
      document.getElementById("chart-container").classList.remove("hidden");
      document
        .getElementById("table-container-wrapper")
        .classList.remove("hidden");

      // Reset to page 1 when loading new data (new date range)
      state.currentPage = 1;

      // Always use applyFilters to ensure proper sorting and pagination
      // even when there are no filters
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

// Load column metadata
async function loadColumns() {
  try {
    const response = await fetch(`${BASE_PATH}/api/columns`);
    const result = await response.json();

    if (response.ok) {
      state.columns = result.columns;
      state.availableColumns = result.columns; // Initially, all columns are available
      state.columnLabels = result.columnLabels || {}; // Store human-readable labels from backend
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

// Load available columns based on current filters (for cascading filters)
async function loadAvailableColumns() {
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
      // Re-render filters with updated available options
      renderFilters();
    }
  } catch (error) {
    console.error("Error loading available columns:", error);
  }
}

// Helper function to highlight matching text
function highlightText(text, query) {
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
function getFilename(path) {
  if (!path || typeof path !== "string") return path;
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

// Render placeholder filters on startup (before data is loaded)
function renderPlaceholderFilters() {
  const section1Container = document.getElementById("filters-section-1");
  const section2Container = document.getElementById("filters-section-2");
  section1Container.innerHTML = "";
  section2Container.innerHTML = "";

  const { Select } = antd;

  // Render section 1 placeholder filters
  CONFIG.filterSections.section1.forEach((column) => {
    if (CONFIG.excludeColumns.includes(column)) return;

    const filterSection = document.createElement("div");
    filterSection.className = "filter-section";

    const label = document.createElement("label");
    const displayLabel = getColumnLabel(column);
    label.textContent = displayLabel;
    label.innerHTML += `<span class="filter-count">(0)</span>`;

    const selectContainer = document.createElement("div");

    filterSection.appendChild(label);
    filterSection.appendChild(selectContainer);
    section1Container.appendChild(filterSection);

    // Render disabled select
    ReactDOM.render(
      React.createElement(Select, {
        mode: "multiple",
        style: { width: "100%" },
        placeholder: `Select ${displayLabel}`,
        disabled: true,
        options: [],
      }),
      selectContainer
    );
  });

  // Render section 2 placeholder filters
  CONFIG.filterSections.section2.forEach((column) => {
    if (CONFIG.excludeColumns.includes(column)) return;

    const filterSection = document.createElement("div");
    filterSection.className = "filter-section";

    const label = document.createElement("label");
    const displayLabel = getColumnLabel(column);
    label.textContent = displayLabel;
    label.innerHTML += `<span class="filter-count">(0)</span>`;

    const selectContainer = document.createElement("div");

    filterSection.appendChild(label);
    filterSection.appendChild(selectContainer);
    section2Container.appendChild(filterSection);

    // Render disabled select
    ReactDOM.render(
      React.createElement(Select, {
        mode: "multiple",
        style: { width: "100%" },
        placeholder: `Select ${displayLabel}`,
        disabled: true,
        options: [],
      }),
      selectContainer
    );
  });
}

// Render filters
function renderFilters() {
  const section1Container = document.getElementById("filters-section-1");
  const section2Container = document.getElementById("filters-section-2");
  section1Container.innerHTML = "";
  section2Container.innerHTML = "";

  // Render section 1 filters
  CONFIG.filterSections.section1.forEach((column) => {
    if (!state.columns[column] || CONFIG.excludeColumns.includes(column))
      return;
    renderFilterControl(column, section1Container);
  });

  // Render section 2 filters
  CONFIG.filterSections.section2.forEach((column) => {
    if (!state.columns[column] || CONFIG.excludeColumns.includes(column))
      return;
    renderFilterControl(column, section2Container);
  });
}

// Helper function to render a single filter control
function renderFilterControl(column, container) {
  const filterSection = document.createElement("div");
  filterSection.className = "filter-section";

  const label = document.createElement("label");
  // Use human-readable label from backend
  const displayLabel = getColumnLabel(column);
  label.textContent = displayLabel;

  // Use availableColumns for count (shows scoped count based on filters)
  const availableCount = state.availableColumns[column]?.values.length || 0;
  const totalCount = state.columns[column]?.values.length || 0;

  // Show both available and total if they differ
  if (availableCount < totalCount) {
    label.innerHTML += `<span class="filter-count">(${availableCount} of ${totalCount})</span>`;
  } else {
    label.innerHTML += `<span class="filter-count">(${totalCount})</span>`;
  }

  const selectContainer = document.createElement("div");
  selectContainer.id = `filter-${column}`;

  filterSection.appendChild(label);
  filterSection.appendChild(selectContainer);
  container.appendChild(filterSection);

  // Create a React component with state for search term
  const { Select, Button } = antd;
  const { useState, useEffect, useRef } = React;

  const FilterSelect = () => {
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedValues, setSelectedValues] = useState([]);
    const [open, setOpen] = useState(false);
    const selectRef = useRef(null);
    const containerRef = useRef(null);
    const openTimeRef = useRef(0);

    // Sync with global state
    useEffect(() => {
      const exactValues = state.filters[column] || [];
      const substringValues = state.substringFilters[column] || [];
      const regexValues = state.regexFilters[column] || [];
      const combined = [
        ...exactValues,
        ...substringValues.map((term) => `__substring__:${term}`),
        ...regexValues.map((pattern) => `__regex__:${pattern}`),
      ];
      setSelectedValues(combined);
    }, []);

    // Handle click outside to close dropdown
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (!open) return;

        // Prevent closing if dropdown was just opened (within 200ms)
        if (Date.now() - openTimeRef.current < 200) {
          return;
        }

        // Find the actual DOM container for this select
        const selectContainer = document.getElementById(`filter-${column}`);
        const dropdown = document.querySelector(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden)"
        );

        // Check if click is outside both the select container and its dropdown
        if (
          selectContainer &&
          !selectContainer.contains(event.target) &&
          (!dropdown || !dropdown.contains(event.target))
        ) {
          setOpen(false);
          setSearchTerm("");
        }
      };

      if (open) {
        // Add listener immediately, but check timing in handler
        document.addEventListener("mousedown", handleClickOutside, true);

        return () => {
          document.removeEventListener("mousedown", handleClickOutside, true);
        };
      }
    }, [open]);

    // Build options list using availableColumns (scoped to current filters)
    const availableValues = state.availableColumns[column]?.values || [];
    let options = availableValues.map((value) => ({
      label: value,
      value: value,
    }));

    // Add substring or regex search option at the top if there's a search term
    if (searchTerm && searchTerm.trim()) {
      const isRegex = isRegexPattern(searchTerm);

      if (isRegex) {
        // Validate regex
        const isValid = isValidRegex(searchTerm);
        const regexSearchKey = `__regex__:${searchTerm}`;

        options = [
          {
            label: isValid
              ? `Regex "${searchTerm}"`
              : `Invalid regex "${searchTerm}"`,
            value: regexSearchKey,
            isRegexSearch: true,
            isValidRegex: isValid,
            disabled: !isValid,
          },
          ...options.filter((opt) =>
            opt.label.toLowerCase().includes(searchTerm.toLowerCase())
          ),
        ];
      } else {
        // Substring search
        const substringSearchKey = `__substring__:${searchTerm}`;
        options = [
          {
            label: `Matching "${searchTerm}"`,
            value: substringSearchKey,
            isSubstringSearch: true,
          },
          ...options.filter((opt) =>
            opt.label.toLowerCase().includes(searchTerm.toLowerCase())
          ),
        ];
      }
    }

    return React.createElement(Select, {
      ref: selectRef,
      mode: "multiple",
      style: { width: "100%" },
      placeholder: `Select ${displayLabel}`,
      options: options,
      value: selectedValues,
      open: open,
      onMouseDown: (e) => {
        // Handle clicking on the select to toggle
        const target = e.target;
        const selector = target.closest(".ant-select-selector");

        if (selector) {
          e.preventDefault();
          const newOpenState = !open;
          if (!newOpenState) {
            setSearchTerm("");
          }
          setOpen(newOpenState);

          // If opening, record the time
          if (newOpenState) {
            openTimeRef.current = Date.now();
          }
        }
      },
      onDropdownVisibleChange: (visible) => {
        // Prevent Ant Design from controlling the dropdown state
        // We manage it manually
        if (visible && !open) {
          setOpen(true);
          openTimeRef.current = Date.now();
        }
      },
      showSearch: true,
      listHeight: CONFIG.chart.listHeight,
      filterOption: (input, option) => {
        if (option.isSubstringSearch || option.isRegexSearch) return true;
        return (option?.label ?? "")
          .toLowerCase()
          .includes(input.toLowerCase());
      },
      onSearch: (value) => {
        setSearchTerm(value);
      },
      dropdownRender: (menu) => {
        return React.createElement("div", {}, [
          React.createElement(
            "div",
            {
              key: "done-button-container",
              style: {
                display: "flex",
                justifyContent: "flex-end",
                padding: "8px 8px 4px 8px",
                borderBottom: "1px solid #f0f0f0",
              },
            },
            React.createElement(
              "a",
              {
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  setSearchTerm("");
                  if (selectRef.current) {
                    selectRef.current.blur();
                  }
                },
                style: {
                  fontSize: "12px",
                  color: "#543fde",
                  cursor: "pointer",
                  textDecoration: "none",
                  fontWeight: "500",
                },
                onMouseEnter: (e) => {
                  e.target.style.textDecoration = "underline";
                },
                onMouseLeave: (e) => {
                  e.target.style.textDecoration = "none";
                },
              },
              "Done"
            )
          ),
          React.createElement(
            "div",
            {
              key: "menu",
            },
            menu
          ),
        ]);
      },
      tagRender: (props) => {
        const { label, value, closable, onClose } = props;

        // Special rendering for filename (file path) tags - show filename and truncated path
        if (
          column === "filename" &&
          !value.startsWith("__substring__:") &&
          !value.startsWith("__regex__:")
        ) {
          const filename = getFilename(label);
          const fullPath = label;
          const truncatedFilename =
            filename.length > 30 ? filename.substring(0, 30) + "..." : filename;
          const truncatedPath =
            fullPath.length > 30 ? fullPath.substring(0, 30) + "..." : fullPath;

          return React.createElement(
            antd.Tooltip,
            {
              title: fullPath,
              key: value,
            },
            React.createElement(
              "span",
              {
                className: "custom-file-tag-wrapper",
                style: {
                  display: "inline-flex",
                  alignItems: "flex-start",
                  background: "#fafafa",
                  border: "1px solid #d9d9d9",
                  borderRadius: "2px",
                  padding: "4px 8px",
                  marginRight: 4,
                  marginBottom: 4,
                  fontSize: "14px",
                  lineHeight: "1.3",
                  position: "relative",
                },
              },
              [
                React.createElement(
                  "div",
                  {
                    key: "content",
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      paddingRight: closable ? "18px" : "0",
                    },
                  },
                  [
                    React.createElement(
                      "div",
                      {
                        key: "filename",
                        style: {
                          fontSize: "13px",
                          fontWeight: "500",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "200px",
                        },
                      },
                      truncatedFilename
                    ),
                    React.createElement(
                      "div",
                      {
                        key: "path",
                        style: {
                          fontSize: "11px",
                          opacity: 0.6,
                          marginTop: "2px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "200px",
                        },
                      },
                      truncatedPath
                    ),
                  ]
                ),
                closable &&
                  React.createElement(
                    "span",
                    {
                      key: "close",
                      className: "anticon anticon-close",
                      onClick: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose(e);
                      },
                      style: {
                        position: "absolute",
                        top: "6px",
                        right: "6px",
                        cursor: "pointer",
                        fontSize: "10px",
                        color: "rgba(0, 0, 0, 0.45)",
                        lineHeight: "1",
                      },
                    },
                    React.createElement(
                      "svg",
                      {
                        viewBox: "64 64 896 896",
                        focusable: "false",
                        width: "1em",
                        height: "1em",
                        fill: "currentColor",
                        "aria-hidden": "true",
                      },
                      React.createElement("path", {
                        d: "M563.8 512l262.5-312.9c4.4-5.2.7-13.1-6.1-13.1h-79.8c-4.7 0-9.2 2.1-12.3 5.7L511.6 449.8 295.1 191.7c-3-3.6-7.5-5.7-12.3-5.7H203c-6.8 0-10.5 7.9-6.1 13.1L459.4 512 196.9 824.9A7.95 7.95 0 00203 838h79.8c4.7 0 9.2-2.1 12.3-5.7l216.5-258.1 216.5 258.1c3 3.6 7.5 5.7 12.3 5.7h79.8c6.8 0 10.5-7.9 6.1-13.1L563.8 512z",
                      })
                    )
                  ),
              ]
            )
          );
        }

        // Check if this is a substring search tag
        if (value.startsWith("__substring__:")) {
          const searchTerm = value.replace("__substring__:", "");
          return React.createElement(
            antd.Tag,
            {
              closable: closable,
              onClose: onClose,
              style: { marginRight: 4, marginBottom: 4 },
              color: "blue",
            },
            `Matching "${searchTerm}"`
          );
        }

        // Check if this is a regex search tag
        if (value.startsWith("__regex__:")) {
          const regexPattern = value.replace("__regex__:", "");
          return React.createElement(
            antd.Tag,
            {
              closable: closable,
              onClose: onClose,
              style: { marginRight: 4, marginBottom: 4 },
              color: "green",
            },
            `Regex "${regexPattern}"`
          );
        }

        // Default rendering for all other fields
        return React.createElement(
          antd.Tag,
          {
            closable: closable,
            onClose: onClose,
            style: { marginRight: 4, marginBottom: 4 },
          },
          label
        );
      },
      optionRender: (option) => {
        const value = option.label;

        // Special rendering for filename (file path) - show filename and path separately
        if (column === "filename" && !option.data?.isSubstringSearch) {
          const filename = getFilename(value);
          const fullPath = value;

          return React.createElement("div", { className: "custom-option" }, [
            React.createElement(
              "div",
              {
                key: "name",
                className: "custom-option-name",
              },
              highlightText(filename, searchTerm)
            ),
            React.createElement(
              "div",
              {
                key: "path",
                className: "custom-option-path",
              },
              highlightText(fullPath, searchTerm)
            ),
          ]);
        }

        // Default rendering for all fields with highlighting
        return React.createElement("div", {}, highlightText(value, searchTerm));
      },
      onChange: (values) => {
        // Check if an item was removed (values count decreased)
        const wasRemoved = values.length < selectedValues.length;

        setSelectedValues(values);

        // Check if dropdown was just opened (within 300ms) - this indicates the 'x' button was clicked
        const wasJustOpened = Date.now() - openTimeRef.current < 300;

        if (wasRemoved && wasJustOpened) {
          // If an item was removed AND the dropdown was just opened, it means the 'x' button was clicked
          // Close the dropdown after a short delay
          setTimeout(() => {
            setOpen(false);
            setSearchTerm("");
          }, 200);
        } else if (!wasRemoved) {
          // Item was added - keep dropdown open after selection (works cross-browser)
          // Don't close the dropdown, let the user close it via Done button or clicking outside
          requestAnimationFrame(() => {
            if (selectRef.current) {
              selectRef.current.focus();
            }
          });
        }
        // If wasRemoved && !wasJustOpened, it means they clicked in the dropdown to deselect - do nothing special

        // Separate exact match values from substring and regex search values
        const exactMatches = [];
        const substringSearches = [];
        const regexSearches = [];

        values.forEach((val) => {
          if (val.startsWith("__substring__:")) {
            const term = val.replace("__substring__:", "");
            substringSearches.push(term);
          } else if (val.startsWith("__regex__:")) {
            const pattern = val.replace("__regex__:", "");
            regexSearches.push(pattern);
          } else {
            exactMatches.push(val);
          }
        });

        state.filters[column] = exactMatches;
        state.substringFilters[column] = substringSearches;
        state.regexFilters[column] = regexSearches;
        applyFilters(true); // Reset to page 1 when filter changes
      },
    });
  };

  ReactDOM.render(React.createElement(FilterSelect), selectContainer);
}

// Apply filters
async function applyFilters(resetPage = false) {
  // Reset to page 1 when filters change (not when just changing pages)
  if (resetPage) {
    state.currentPage = 1;
  }

  // Clean up empty filter arrays to avoid sending unnecessary data
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

    console.log("Applying filters with request:", requestBody);

    const response = await fetch(`${BASE_PATH}/api/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();

    console.log("Apply filters result:", {
      dataCount: result.data?.length,
      chartDataCount: result.chartData?.length,
      total: result.total,
    });

    if (response.ok) {
      // Check if current page is valid for the total results
      const maxPage = Math.max(1, Math.ceil(result.total / state.pageSize));
      if (state.currentPage > maxPage) {
        console.log(
          `Current page ${state.currentPage} exceeds max page ${maxPage}, resetting to page 1`
        );
        state.currentPage = 1;
        // Re-fetch with corrected page
        applyFilters(false);
        return;
      }

      // Check for data mismatch (this shouldn't happen but let's be defensive)
      if (
        (!result.data || result.data.length === 0) &&
        result.chartData &&
        result.chartData.length > 0 &&
        result.total > 0
      ) {
        console.warn(
          "Data mismatch detected: chartData has data but table data is empty. Resetting to page 1."
        );
        state.currentPage = 1;
        applyFilters(false);
        return;
      }

      state.filteredData = result.data || [];
      state.chartData = result.chartData || result.data || []; // Use separate chart data
      console.log("State after update:", {
        filteredDataCount: state.filteredData.length,
        chartDataCount: state.chartData.length,
        total: result.total,
        currentPage: state.currentPage,
        maxPage: maxPage,
      });
      updateChart();
      updateTable(result.total);

      // Update available filter options based on current filters (cascading filters)
      // Only do this if we have filters applied and we're resetting to page 1 (filter change)
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

// Execute SQL query
async function executeSqlQuery() {
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
      state.chartData = result.chartData || result.data; // Use separate chart data
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

// Helper function to determine bucket size based on date range
function determineTimeBucket(dateRange) {
  if (!dateRange || dateRange.length < 2) return "day";

  const days = dateRange[1].diff(dateRange[0], "days");

  if (days <= 1) return "hour";
  if (days <= 7) return "day";
  if (days <= 60) return "day";
  if (days <= 365) return "week";
  return "month";
}

// Helper function to bucket timestamps
function bucketTimestamp(timestamp, bucket) {
  const date = dayjs(timestamp);

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
function getTopNValues(data, field, n = 10) {
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

// Render field selector
function renderFieldSelector() {
  const container = document.getElementById("chart-field-selector");
  const { Select } = antd;
  const { useState, useEffect } = React;

  // Use the same fields as filter section 1 for consistency
  // Only include fields that exist in the loaded data and are not excluded
  const availableFields = CONFIG.filterSections.section1.filter(
    (col) => state.columns[col] && !CONFIG.excludeColumns.includes(col)
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

// Helper function to generate all time buckets within a date range
function generateTimeBuckets(startDate, endDate, bucket) {
  const buckets = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);

  while (
    current.isBefore(end) ||
    current.isSame(end, bucket === "hour" ? "hour" : "day")
  ) {
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

// Update chart
function updateChart() {
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
      chart: {
        type: "column",
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
      series: [
        {
          name: "Events",
          data: chartData,
        },
      ],
      credits: {
        enabled: false,
      },
      plotOptions: {
        column: {
          borderWidth: 0,
        },
      },
      tooltip: {
        shared: true,
      },
    };

    Highcharts.chart("chart", chartConfig);
  } else {
    // Stacked area chart by field
    const topValues =
      state.chartData && state.chartData.length > 0
        ? getTopNValues(
            state.chartData,
            state.selectedField,
            CONFIG.chart.topNValues
          )
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

    // Add "Other" if there are more than 10 unique values
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
      chart: {
        type: "column",
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
          stacking: "normal",
          borderWidth: 0,
        },
      },
      series: series,
      credits: {
        enabled: false,
      },
      tooltip: {
        shared: true,
      },
    };

    Highcharts.chart("chart", chartConfig);
  }
}

// Update table
function updateTable(total) {
  console.log("updateTable called with:", {
    total,
    filteredDataLength: state.filteredData?.length,
    filteredDataExists: !!state.filteredData,
    currentPage: state.currentPage,
  });

  const container = document.getElementById("table-container");
  const tableInfo = document.getElementById("table-info");
  const tableHeading = document.getElementById("table-heading");

  if (!state.filteredData || state.filteredData.length === 0) {
    console.log("No data to display in table");
    // Use React to render empty state instead of innerHTML
    ReactDOM.render(
      React.createElement(
        "p",
        {
          style: { textAlign: "center", padding: "20px", color: "#65657b" },
        },
        "No data available"
      ),
      container
    );
    tableInfo.textContent = "";
    tableHeading.textContent = "Event Details";
    return;
  }

  console.log("Rendering table with data:", state.filteredData.length, "rows");

  // Update heading and info
  const totalRecords = total !== undefined ? total : state.filteredData.length;
  const start =
    totalRecords > 0 ? (state.currentPage - 1) * state.pageSize + 1 : 0;
  const end = Math.min(start + state.filteredData.length - 1, totalRecords);
  tableHeading.textContent = `Event Details (${totalRecords} total events)`;
  tableInfo.textContent =
    totalRecords > 0 ? `Showing ${start}-${end}` : "No results";

  console.log("Table info update:", {
    currentPage: state.currentPage,
    totalRecords,
    start,
    end,
    dataLength: state.filteredData.length,
  });

  // Get all columns from data
  const allColumns =
    state.filteredData.length > 0 ? Object.keys(state.filteredData[0]) : [];

  // Build ordered column list, hiding specified columns
  const visibleColumns = [
    ...CONFIG.tableColumnOrder.filter((col) => allColumns.includes(col)),
    ...allColumns.filter(
      (col) =>
        !CONFIG.tableColumnOrder.includes(col) &&
        !CONFIG.hiddenTableColumns.includes(col)
    ),
  ];

  // Create table
  const { Table } = antd;

  const antColumns = visibleColumns.map((col) => {
    const columnConfig = {
      title: getColumnLabel(col),
      dataIndex: col,
      key: col,
      ellipsis: true,
      width: col === "filename" ? 300 : col === "timestamp" ? 180 : undefined,
      sorter: true, // Enable sorting on all columns
      sortDirections: ["ascend", "descend", "ascend"], // Only toggle between ASC and DESC, no clear
      sortOrder:
        state.sortColumn === col
          ? state.sortOrder === "ASC"
            ? "ascend"
            : "descend"
          : null,
    };

    // Format timestamp to be human-readable
    if (col === "timestamp") {
      columnConfig.render = (text) => {
        if (!text) return "";
        const date = new Date(text);
        return date.toLocaleString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
      };
    }

    return columnConfig;
  });

  const antDataSource = state.filteredData.map((row, index) => ({
    ...row,
    key: index,
  }));

  ReactDOM.render(
    React.createElement(Table, {
      key: `table-${totalRecords}-${state.currentPage}-${state.sortColumn}-${state.sortOrder}`, // Force re-render when pagination or sorting changes
      columns: antColumns,
      dataSource: antDataSource,
      pagination: {
        current: state.currentPage,
        pageSize: state.pageSize,
        total: totalRecords,
        showSizeChanger: false,
      },
      scroll: { x: "max-content" },
      onChange: (pagination, filters, sorter) => {
        console.log("Table onChange:", {
          pagination,
          sorter,
          currentState: {
            page: state.currentPage,
            sortColumn: state.sortColumn,
            sortOrder: state.sortOrder,
          },
        });

        let needsUpdate = false;
        let sortChanged = false;

        // Check if sorting actually changed by comparing sorter with current state
        // sorter.columnKey exists when a column header is clicked
        // sorter.order can be 'ascend', 'descend', or undefined (when clearing sort)
        if (sorter && sorter.columnKey && sorter.order) {
          // Ant Design tells us what the new sort should be through sorter.order
          const newSortOrder = sorter.order === "ascend" ? "ASC" : "DESC";
          const newSortColumn = sorter.columnKey;

          // Check if sort actually changed
          if (
            state.sortColumn !== newSortColumn ||
            state.sortOrder !== newSortOrder
          ) {
            console.log("Sort changed:", {
              from: { column: state.sortColumn, order: state.sortOrder },
              to: { column: newSortColumn, order: newSortOrder },
            });

            // Use what Ant Design tells us (it already handles the toggling)
            state.sortColumn = newSortColumn;
            state.sortOrder = newSortOrder;
            state.currentPage = 1; // Reset to page 1 when sorting changes
            sortChanged = true;
            needsUpdate = true;
          }
        }

        // Handle pagination changes (only if sort didn't change)
        if (
          !sortChanged &&
          pagination &&
          pagination.current &&
          pagination.current !== state.currentPage
        ) {
          console.log(
            "Pagination changed from",
            state.currentPage,
            "to",
            pagination.current
          );
          state.currentPage = pagination.current;
          needsUpdate = true;
        }

        if (needsUpdate) {
          console.log("Applying filters with:", {
            page: state.currentPage,
            sortColumn: state.sortColumn,
            sortOrder: state.sortOrder,
          });
          applyFilters(false); // Don't reset page since we just set it
        }
      },
    }),
    container
  );
}

// Show/hide loading indicator
function showLoading(show) {
  const loading = document.getElementById("loading");
  if (show) {
    loading.classList.add("active");
  } else {
    loading.classList.remove("active");
  }
}

// Show error message
function showError(message) {
  const container = document.getElementById("error-container");
  container.innerHTML = `<div class="error-message">${message}</div>`;
}

// Clear error message
function clearError() {
  const container = document.getElementById("error-container");
  container.innerHTML = "";
}

// Trigger data sync
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

// Download data as CSV
async function downloadCSV() {
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

      // Extract filename from Content-Disposition header if available
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

// Download data as Parquet
async function downloadParquet() {
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

      // Extract filename from Content-Disposition header if available
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

// Initialize
dayjs.extend(dayjs_plugin_customParseFormat);
dayjs.extend(dayjs_plugin_weekday);
dayjs.extend(dayjs_plugin_localeData);
dayjs.extend(dayjs_plugin_weekOfYear);
dayjs.extend(dayjs_plugin_weekYear);
dayjs.extend(dayjs_plugin_advancedFormat);

initializeDateRange();
renderPlaceholderFilters();
renderSyncButton();
// User must click Submit to load data
