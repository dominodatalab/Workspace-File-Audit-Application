// ============================================================================
// TABLE COMPONENT
// ============================================================================

import { CONFIG } from "../config.js";
import { state, saveHiddenColumns } from "../state.js";
import { getColumnLabel } from "../utils/helpers.js";
import { applyFilters } from "../services/api.js";

// Renders the "Columns" dropdown that lets the user toggle column visibility.
// `displayableColumns` is the full set of columns eligible to be shown.
function renderColumnToggle(displayableColumns, total) {
  const mount = document.getElementById("column-toggle");
  if (!mount) return;

  const { Dropdown, Checkbox, Button } = antd;

  const buildMenu = () =>
    React.createElement(
      "div",
      { className: "column-toggle-menu" },
      React.createElement(
        "div",
        { className: "column-toggle-menu-title" },
        "Show columns"
      ),
      displayableColumns.map((col) => {
        const checked = !state.hiddenColumns.includes(col);
        // Prevent hiding the last visible column
        const isLastVisible =
          checked &&
          displayableColumns.filter((c) => !state.hiddenColumns.includes(c))
            .length === 1;

        return React.createElement(
          "div",
          { key: col, className: "column-toggle-item" },
          React.createElement(
            Checkbox,
            {
              checked,
              disabled: isLastVisible,
              onChange: (e) => {
                if (e.target.checked) {
                  state.hiddenColumns = state.hiddenColumns.filter(
                    (c) => c !== col
                  );
                } else if (!state.hiddenColumns.includes(col)) {
                  state.hiddenColumns = [...state.hiddenColumns, col];
                }
                saveHiddenColumns();
                updateTable(total);
              },
            },
            getColumnLabel(col)
          )
        );
      })
    );

  ReactDOM.render(
    React.createElement(
      Dropdown,
      {
        trigger: ["click"],
        placement: "bottomRight",
        dropdownRender: () => buildMenu(),
      },
      React.createElement(
        Button,
        {
          size: "small",
          className: "column-toggle-btn",
          title: "Show/hide columns",
          "aria-label": "Show/hide columns",
          icon: React.createElement(
            "svg",
            {
              width: 16,
              height: 16,
              viewBox: "0 0 24 24",
              fill: "none",
              xmlns: "http://www.w3.org/2000/svg",
            },
            React.createElement("line", {
              x1: 4, y1: 8, x2: 20, y2: 8,
              stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round",
            }),
            React.createElement("circle", {
              cx: 9, cy: 8, r: 2.5,
              fill: "#fff", stroke: "currentColor", strokeWidth: 2,
            }),
            React.createElement("line", {
              x1: 4, y1: 16, x2: 20, y2: 16,
              stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round",
            }),
            React.createElement("circle", {
              cx: 15, cy: 16, r: 2.5,
              fill: "#fff", stroke: "currentColor", strokeWidth: 2,
            })
          ),
        }
      )
    ),
    mount
  );
}

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

  const displayableColumns = [
    ...CONFIG.tableColumnOrder.filter((col) => allColumns.includes(col)),
    ...allColumns.filter(
      (col) => !CONFIG.tableColumnOrder.includes(col) && !CONFIG.hiddenTableColumns.includes(col)
    ),
  ];

  renderColumnToggle(displayableColumns, total);

  const visibleColumns = displayableColumns.filter(
    (col) => !state.hiddenColumns.includes(col)
  );

  const { Table } = antd;

  const antColumns = visibleColumns.map((col) => {
    const columnConfig = {
      title: getColumnLabel(col).toUpperCase(),
      dataIndex: col,
      key: col,
      ellipsis: true,
      width: col === "filename" ? 300 : col === "timestamp" ? 180 : 150,
      resizable: true,
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

  const ResizableTitle = (props) => {
    const { onResize, width, ...restProps } = props;

    if (!width) {
      return React.createElement("th", restProps);
    }

    const thRef = React.useRef(null);

    React.useEffect(() => {
      const th = thRef.current;
      if (!th) return;

      const resizer = th.querySelector('.react-resizable-handle');
      if (!resizer) return;

      let startX = 0;
      let startWidth = 0;

      const handleMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();

        startX = e.pageX;
        startWidth = th.offsetWidth;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (e) => {
          e.preventDefault();
          const newWidth = startWidth + (e.pageX - startX);
          if (newWidth > 50) {
            requestAnimationFrame(() => {
              th.style.width = newWidth + 'px';
              th.style.minWidth = newWidth + 'px';
            });
          }
        };

        const handleMouseUp = () => {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      };

      resizer.addEventListener('mousedown', handleMouseDown);

      return () => {
        resizer.removeEventListener('mousedown', handleMouseDown);
      };
    }, [onResize]);

    return React.createElement(
      "th",
      { ...restProps, ref: thRef, style: { ...restProps.style, position: 'relative', width } },
      restProps.children,
      React.createElement("span", {
        className: "react-resizable-handle",
        onClick: (e) => e.stopPropagation(),
      })
    );
  };

  const mergedColumns = antColumns.map((col) => ({
    ...col,
    onHeaderCell: (column) => ({
      width: column.width,
    }),
  }));

  const antDataSource = state.filteredData.map((row, index) => ({
    ...row,
    key: index,
  }));

  ReactDOM.render(
    React.createElement(Table, {
      key: `table-${totalRecords}-${state.currentPage}-${state.sortColumn}-${state.sortOrder}`,
      columns: mergedColumns,
      dataSource: antDataSource,
      pagination: {
        current: state.currentPage,
        pageSize: state.pageSize,
        total: totalRecords,
        showSizeChanger: false,
      },
      scroll: { x: "max-content" },
      components: {
        header: {
          cell: ResizableTitle,
        },
      },
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
