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

### 1. Date Range Picker (Top)
- **Default**: Last 30 days
- **Customizable**: Select any date range
- **Action**: Downloads fresh parquet data from Domino API
- **Format**: YYYY-MM-DD

### 2. Filter Panel (Left Sidebar)
- **Multi-select**: Choose multiple values per filter
- **Autocomplete Search**: Type to find specific values
- **Available Filters**:
  - Username
  - Action (Read/Write)
  - Project Name
  - Hardware Tier
  - Environment Name
  - Workspace Name
  - Project ID
  - User ID
  - Filename (partial match)
- **Real-time**: Filters apply locally on cached data
- **Count Indicators**: Shows number of unique values per column

### 3. Chart Visualization (Center Top)
- **Chart Types**:
  - **Column Chart**: Vertical bars for comparing categories
  - **Line Chart**: Trend analysis over time
  - **Pie Chart**: Proportional distribution
  - **Area Chart**: Cumulative trends
- **Interactive**: Hover for details, click to filter
- **Powered by**: Highcharts library
- **Default View**: Events grouped by action type

### 4. Data Table (Center Bottom)
- **Columns**: All event fields displayed
- **Pagination**: 20 records per page
- **Scrollable**: Horizontal scroll for many columns
- **Sortable**: Click column headers to sort
- **Ellipsis**: Long text truncated with hover tooltip
- **Navigation**: First, Previous, Page numbers, Next, Last

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

## Workflow

### Standard Filtering Workflow
1. **Select Date Range** → Click "Load Data"
2. **View Overview** → Chart shows distribution
3. **Apply Filters** → Use left sidebar multi-selects
4. **Explore Data** → Browse paginated table
5. **Change Visualization** → Select different chart type
6. **Refine Filters** → Add/remove filter values
7. **Navigate Pages** → View more records

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

## Future Enhancements (Potential)
- Export to CSV/Excel
- Save favorite queries
- Custom chart configurations
- Real-time updates via WebSocket
- User preferences storage
- Multi-file parquet support
- Advanced chart drilling
- Data export functionality
- Query history
- Bookmarkable filter states

