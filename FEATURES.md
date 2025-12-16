# Workspace Audit Events Viewer - Feature Guide

## Overview
A comprehensive web application for visualizing and analyzing Domino workspace audit events with a modern, intuitive interface.

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  🔷 Domino Logo | Workspace Audit                                │  ← Navigation Bar
├──────────┬──────────────────────────────────────────────────────┤
│          │  Workspace Audit Events                              │
│  FILTERS │  ┌────────────────────────────────────────────────┐  │
│          │  │ Date Range: [Start] - [End]  [Load Data]      │  │  ← Date Controls
│ Username │  │ ☐ Advanced SQL Mode                            │  │
│ [Multi]  │  └────────────────────────────────────────────────┘  │
│          │                                                       │
│ Action   │  ┌─────────────────────────────────────────────┐    │
│ [Multi]  │  │ Events Overview    Chart Type: [Column ▼]  │    │
│          │  │ ┌───────────────────────────────────────┐   │    │  ← Chart Area
│ Project  │  │ │                                       │   │    │
│ [Multi]  │  │ │        [Bar/Line/Pie/Area Chart]     │   │    │
│          │  │ │                                       │   │    │
│ Hardware │  │ └───────────────────────────────────────┘   │    │
│ [Multi]  │  └─────────────────────────────────────────────┘    │
│          │                                                       │
│ Environ  │  ┌─────────────────────────────────────────────┐    │
│ [Multi]  │  │ Event Details              Showing 1-20/100 │    │
│          │  │ ┌───────────────────────────────────────┐   │    │  ← Data Table
│ Worksp   │  │ │ uuid | timestamp | action | filename │   │    │
│ [Multi]  │  │ │ abc  | 2025-11-12| Read   | file.py  │   │    │
│          │  │ │ ...  | ...       | ...    | ...      │   │    │
│          │  │ └───────────────────────────────────────┘   │    │
│          │  │              [1] [2] [3] ... [Next]         │    │  ← Pagination
│          │  └─────────────────────────────────────────────┘    │
└──────────┴──────────────────────────────────────────────────────┘
```

## Key Features

### 1. Date Range Picker & Controls (Top)
- **Default**: Last 7 days
- **Auto-load**: Data loads automatically on page load
- **Customizable**: Select any date range and click "Query"
- **Action**: Downloads fresh parquet data from Domino API
- **Format**: YYYY-MM-DD
- **Data Refresh Status**: Shows last sync time and current status
  - Displays timestamp of most recent data ingestion
  - Updates every 60 seconds
  - Status indicators: "Completed", "In Progress", etc.

### 2. Filter Panel (Left Sidebar)
- **Multi-select**: Choose multiple values per filter
- **Autocomplete Search**: Type to find specific values
- **Filter Types**:
  - **Exact Match**: Select specific values from dropdown
  - **Substring Search**: Type text to match partial values (e.g., "demo")
  - **Regex Patterns**: Type `/pattern/` for advanced matching (e.g., `/\.py$/`)
- **Available Filters**:
  - Username
  - Action (Read/Write)
  - Project Name
  - Workspace Name
  - Filename (supports all three filter types)
  - Environment Name
  - Hardware Tier
- **Cascading**: Filter options update based on current selections
- **Real-time**: Filters apply locally on cached data
- **Count Indicators**: Shows available/total unique values per column
- **Info Icons**: Hover tooltips explain filter functionality

### 3. Chart Visualization (Center Top)
- **Time Series**: Events over time with automatic bucketing (daily/weekly/monthly)
- **Breakdown Field**: Select any field to split the chart by that dimension
- **Top N Values**: Shows top 10 values, groups others as "Other"
- **Stacked Area Chart**: Visual representation of event distribution
- **Interactive**: Hover for details, legend for toggling series
- **Powered by**: Highcharts library
- **Export**: Download chart as PNG/SVG

### 4. Data Table (Center Bottom)
- **Columns**: All event fields displayed with human-readable labels
- **Column Order**: Logical ordering (timestamp, username, action, filename, etc.)
- **Hidden Columns**: Sensitive fields (userId, uuid) hidden by default
- **Pagination**: 100 records per page
- **Scrollable**: Horizontal scroll for many columns
- **Sortable**: Click column headers to sort ascending/descending
- **Formatted Data**: Timestamps shown in human-readable format
- **Ellipsis**: Long text truncated with full text visible on hover
- **Navigation**: Page numbers with current page indicator

### 5. Advanced SQL Mode (Toggle)
- **Access**: Enable via checkbox in header
- **Effect**: Hides filter panel, shows SQL editor
- **Query Editor**:
  - Monospace font for readability
  - Syntax: Standard SQL (DuckDB dialect)
  - Table name: Use `events` (auto-replaced with parquet path)
- **Example Queries**:
  ```sql
  SELECT * FROM events WHERE action = 'Write'
  
  SELECT username, COUNT(*) as count 
  FROM events 
  GROUP BY username 
  ORDER BY count DESC
  
  SELECT * FROM events 
  WHERE filename LIKE '%.py' 
  AND action = 'Read'
  ```
- **Execute**: Button to run query
- **Results**: Update both chart and table

### 6. Data Export
- **CSV Export**: Download filtered data as CSV with human-readable column labels
- **Parquet Export**: Download filtered data as Parquet for data science workflows
- **Filtered Results**: Exports respect all active filters
- **Timestamped Filenames**: Automatic filename generation with date range

### 7. Info Banner
- **Usage Information**: Displays key information about data sources and refresh frequency
- **Dismissible**: Close button to hide the banner
- **Helpful Context**: Explains that data captures NetApp Volumes and Domino Datasets activity

### 8. Help & Documentation
- **Navigation Link**: Accessible from top navigation bar
- **External Documentation**: Links to official Domino documentation
- **Comprehensive Guide**: Covers all features and use cases

## Workflow

### Standard Filtering Workflow
1. **Page Load** → Data loads automatically for last 7 days
2. **View Overview** → Chart shows event distribution over time
3. **Apply Filters** → Use left sidebar multi-selects, substring, or regex
4. **Explore Data** → Browse paginated table with sorting
5. **Change Breakdown** → Select different field for chart breakdown
6. **Refine Filters** → Add/remove filter values, cascading updates
7. **Navigate Pages** → View more records (100 per page)
8. **Export Data** → Download filtered results as CSV or Parquet

### Advanced SQL Workflow
1. **Select Date Range** → Click "Load Data"
2. **Enable Advanced Mode** → Check "Advanced SQL Mode"
3. **Write Query** → Use SQL syntax in text area
4. **Execute** → Click "Execute Query"
5. **Analyze Results** → View chart and table
6. **Iterate** → Modify query and re-execute

## Technical Highlights

### Backend (Flask + DuckDB)
- **Fast Queries**: DuckDB optimized for analytical queries
- **Efficient Storage**: Parquet columnar format
- **Smart Caching**: Reuses downloaded data for same date range
- **SQL Power**: Full SQL capabilities for complex analysis

### Frontend (React + Ant Design + Highcharts)
- **Responsive**: Adapts to different screen sizes
- **Modern UI**: Follows Domino design system
- **Interactive**: Real-time filtering and updates
- **Performant**: Efficient rendering of large datasets

### Data Flow
```
User Selects Date Range
         ↓
Flask API Calls Domino API
         ↓
Downloads Parquet Files
         ↓
Caches Locally
         ↓
User Applies Filters/SQL
         ↓
DuckDB Queries Parquet
         ↓
Results Returned to UI
         ↓
Chart & Table Updated
```

## Color Scheme (Domino Design System)
- **Navigation**: Dark Gray (#2e2e38)
- **Background**: Light Gray (#fafafa)
- **Primary**: Purple (#543fde)
- **Text Primary**: Dark Gray (#2e2e38)
- **Text Secondary**: Medium Gray (#65657b)
- **Borders**: Light Gray (#d6d6d6, #f0f0f0)

## Browser Compatibility
- **Chrome**: ✅ Fully supported
- **Firefox**: ✅ Fully supported
- **Safari**: ✅ Fully supported
- **Edge**: ✅ Fully supported

## Performance Tips
1. **Date Range**: Smaller ranges load faster
2. **Filters**: Apply specific filters to reduce dataset
3. **SQL Queries**: Use WHERE clauses for better performance
4. **Pagination**: Only loads visible records
5. **Caching**: Same date range doesn't re-download

## Keyboard Shortcuts
- **Filter Search**: Type immediately when dropdown opens
- **Table Navigation**: Arrow keys to scroll
- **SQL Editor**: Tab for indentation
- **Date Picker**: Arrow keys to navigate dates

## Error Handling
- **Invalid Date Range**: Shows error message
- **API Failures**: Displays user-friendly error
- **SQL Errors**: Shows query error details
- **No Data**: Displays "No data available" message
- **Loading States**: Shows spinner during operations

## Implemented Features
- ✅ CSV/Parquet export
- ✅ Cascading filters
- ✅ Regex pattern matching
- ✅ Data refresh status monitoring
- ✅ Info banner with usage information
- ✅ Help documentation link
- ✅ Automatic data loading on startup
- ✅ Column sorting
- ✅ Human-readable column labels

## Future Enhancements (Potential)
- Save favorite queries
- Custom chart configurations
- User preferences storage
- Query history
- Bookmarkable filter states
- Column visibility toggle
- Advanced date range presets (last 24 hours, last month, etc.)

