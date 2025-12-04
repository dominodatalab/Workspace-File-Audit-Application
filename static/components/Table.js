// ============================================================================
// TABLE COMPONENT
// ============================================================================

import { CONFIG } from "../config.js";
import { state } from "../state.js";
import { getColumnLabel } from "../utils/helpers.js";
import { applyFilters } from "../services/api.js";

// Update table
export function updateTable(total) {
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
      (col) => !CONFIG.tableColumnOrder.includes(col) && !CONFIG.hiddenTableColumns.includes(col)
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
