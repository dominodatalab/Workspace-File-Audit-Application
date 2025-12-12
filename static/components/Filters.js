// ============================================================================
// FILTERS COMPONENT
// ============================================================================

import { CONFIG } from "../config.js";
import { state } from "../state.js";
import {
  getColumnLabel,
  isRegexPattern,
  isValidRegex,
  highlightText,
  getFilename,
} from "../utils/helpers.js";
import { applyFilters } from "../services/api.js";

// Helper to render a single placeholder filter
function renderPlaceholderFilter(column, container) {
  const { Select } = antd;

  const filterSection = document.createElement("div");
  filterSection.className = "filter-section";

  const label = document.createElement("label");
  const displayLabel = getColumnLabel(column);
  label.textContent = displayLabel;
  label.innerHTML += `<span class="filter-count">(0)</span>`;

  // Add info icon with tooltip for all filters
  const infoIcon = document.createElement("span");
  infoIcon.className = "filter-info-icon";

  // Different tooltip text for filename vs other filters
  const tooltipText = column === "filename"
    ? "Filter by selecting files, typing substrings to match, or entering regex (begins with /)."
    : "Filter by selecting values or typing substrings to match.";

  infoIcon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
      <path d="M12 16v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="8" r="1" fill="currentColor"/>
    </svg>
    <span class="filter-tooltip">${tooltipText}</span>
  `;

  // Position tooltip dynamically on hover
  infoIcon.addEventListener("mouseenter", () => {
    const tooltip = infoIcon.querySelector(".filter-tooltip");
    const rect = infoIcon.getBoundingClientRect();
    tooltip.style.left = `${rect.right + 8}px`;
    tooltip.style.top = `${rect.top + rect.height / 2}px`;
    tooltip.style.transform = `translateY(-50%)`;
  });

  label.appendChild(infoIcon);

  const selectContainer = document.createElement("div");

  filterSection.appendChild(label);
  filterSection.appendChild(selectContainer);
  container.appendChild(filterSection);

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
}

// Helper to render filters for a specific section
function renderFilterSection(sectionName, container, isPlaceholder = false) {
  const sectionConfig = CONFIG.filterSections[sectionName];
  if (!sectionConfig) return;

  sectionConfig.forEach((column) => {
    if (CONFIG.excludeColumns.includes(column)) return;

    if (isPlaceholder) {
      renderPlaceholderFilter(column, container);
    } else {
      if (!state.columns[column]) return;
      renderFilterControl(column, container);
    }
  });
}

// Render placeholder filters on startup (before data is loaded)
export function renderPlaceholderFilters() {
  const section1Container = document.getElementById("filters-section-1");
  const section2Container = document.getElementById("filters-section-2");
  section1Container.innerHTML = "";
  section2Container.innerHTML = "";

  renderFilterSection("section1", section1Container, true);
  renderFilterSection("section2", section2Container, true);
}

// Render filters
export function renderFilters() {
  const section1Container = document.getElementById("filters-section-1");
  const section2Container = document.getElementById("filters-section-2");
  section1Container.innerHTML = "";
  section2Container.innerHTML = "";

  renderFilterSection("section1", section1Container, false);
  renderFilterSection("section2", section2Container, false);
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

  // Add info icon with tooltip for all filters
  const infoIcon = document.createElement("span");
  infoIcon.className = "filter-info-icon";

  // Different tooltip text for filename vs other filters
  const tooltipText = column === "filename"
    ? "Filter by selecting files, typing substrings to match, or entering regex (begins with /)."
    : "Filter by selecting values or typing substrings to match.";

  infoIcon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
      <path d="M12 16v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="8" r="1" fill="currentColor"/>
    </svg>
    <span class="filter-tooltip">${tooltipText}</span>
  `;

  // Position tooltip dynamically on hover
  infoIcon.addEventListener("mouseenter", () => {
    const tooltip = infoIcon.querySelector(".filter-tooltip");
    const rect = infoIcon.getBoundingClientRect();
    tooltip.style.left = `${rect.right + 8}px`;
    tooltip.style.top = `${rect.top + rect.height / 2}px`;
    tooltip.style.transform = `translateY(-50%)`;
  });

  label.appendChild(infoIcon);

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
