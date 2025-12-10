// ============================================================================
// CONFIGURATION
// ============================================================================

// Application configuration
export const CONFIG = {
  // Default pagination settings
  pageSize: 100,
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

  // Columns to exclude from field selector (chart breakdown)
  fieldSelectorExcludeColumns: [
    "uuid",
    "deduplicationId",
    "timestamp",
    "projectId",
    "userId",
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
    environmentRevisionNumber: "Environment Revision Number",
    hardwareTierId: "Hardware Tier",
    projectId: "Project ID",
    workspaceId: "Workspace ID",
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
