// ============================================================================
// TABLE COMPONENT
// ============================================================================

import { CONFIG } from "../config.js";
import { state } from "../state.js";
import { getColumnLabel } from "../utils/helpers.js";
import { applyFilters } from "../services/api.js";

export function updateTable(total) {
  const container = document.getElementById("table-container");
  const tableInfo = document.getElementById("table-info");
  const tableHeading = document.getElementById("table-heading");

  if (!state.filteredData || state.filteredData.length === 0) {
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

  const totalRecords = total !== undefined ? total : state.filteredData.length;
  const start =
    totalRecords > 0 ? (state.currentPage - 1) * state.pageSize + 1 : 0;
  const end = Math.min(start + state.filteredData.length - 1, totalRecords);
  tableHeading.textContent = `Event Details (${totalRecords} total events)`;
  tableInfo.textContent =
    totalRecords > 0 ? `Showing ${start}-${end}` : "No results";

  const allColumns =
    state.filteredData.length > 0 ? Object.keys(state.filteredData[0]) : [];

  const visibleColumns = [
    ...CONFIG.tableColumnOrder.filter((col) => allColumns.includes(col)),
    ...allColumns.filter(
      (col) => !CONFIG.tableColumnOrder.includes(col) && !CONFIG.hiddenTableColumns.includes(col)
    ),
  ];

  const { Table } = antd;

  const antColumns = visibleColumns.map((col) => {
    const columnConfig = {
      title: getColumnLabel(col).toUpperCase(),
      dataIndex: col,
      key: col,
      ellipsis: true,
      width: col === "filename" ? 300 : col === "timestamp" ? 180 : undefined,
      sorter: true,
      sortDirections: ["ascend", "descend", "ascend"],
      sortOrder:
        state.sortColumn === col
          ? state.sortOrder === "ASC"
            ? "ascend"
            : "descend"
          : null,
    };

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
      key: `table-${totalRecords}-${state.currentPage}-${state.sortColumn}-${state.sortOrder}`,
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
        let needsUpdate = false;
        let sortChanged = false;

        if (sorter && sorter.columnKey && sorter.order) {
          const newSortOrder = sorter.order === "ascend" ? "ASC" : "DESC";
          const newSortColumn = sorter.columnKey;

          if (
            state.sortColumn !== newSortColumn ||
            state.sortOrder !== newSortOrder
          ) {
            state.sortColumn = newSortColumn;
            state.sortOrder = newSortOrder;
            state.currentPage = 1;
            sortChanged = true;
            needsUpdate = true;
          }
        }

        if (
          !sortChanged &&
          pagination &&
          pagination.current &&
          pagination.current !== state.currentPage
        ) {
          state.currentPage = pagination.current;
          needsUpdate = true;
        }

        if (needsUpdate) {
          applyFilters(false);
        }
      },
    }),
    container
  );
}
