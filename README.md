# Workspace Audit Event App

A modern web application for visualizing and analyzing Domino workspace audit events with advanced filtering.

## Features

- **Date Range Selection**: Choose any date range with a user-friendly date picker (defaults to last 30 days)
- **Interactive Visualizations**: Time series charts with optional breakdown by any field, powered by Highcharts
- **Advanced Filtering**: Multi-select filters with autocomplete search for all event columns
  - **Substring Search**: Type any text to match partial values (e.g., "demo" matches "demofile.txt")
  - **Regex Filtering**: Type regex patterns starting with `/` for advanced pattern matching (e.g., `/demofile\d*\.[^/]+$`)
  - **Exact Match**: Select specific values from the dropdown
- **Cascading Filters**: Filter options update dynamically based on selected filters
- **Sorting**: Click column headers to sort by any field (ascending/descending)
- **Pagination**: Browse through events with 20 records per page
- **Data Export**: Download filtered results as CSV or Parquet files
- **Real-time Updates**: Filters are applied using DuckDB SQL on cached data for instant results

## Technology Stack

### Backend

- **Flask**: Web framework for serving the UI and API endpoints
- **DuckDB**: High-performance SQL engine for querying Parquet files
- **Pandas**: Data manipulation and analysis
- **Requests**: HTTP library for fetching data from Domino API

### Frontend

- **Ant Design**: UI component library for filters, tables, and date pickers
- **Highcharts**: Professional charting library for data visualization
- **React**: For rendering Ant Design components
- **Vanilla JavaScript**: Core application logic

## Usage

### Deployment in Domino

1. Go to **Projects > New Project**, then select **Import from Git** and enter the repository URL

2. Complete the project creation and open the project

3. Go to **Deployments > Apps & Agents > Publish > App**

4. Configure the deployment:

   - **Name and Description**: (example: "Workspace File Audit Query Tool")
   - **Environment**: Choose the latest Domino Standard Environment
   - **Code**: Select `start.sh` as the App File
   - **Hardware Tier**: Medium
   - **Enable deep linking and query parameters**: Check this option

5. Click **Publish**. Wait for the app status to show **Running**, then select **Open**

### Using the Application

- **Select Date Range**: Use the date picker to choose your desired time period (defaults to last 7 days)
- **Load Data**: Click "Query" to fetch events from the Domino API (automatically loads on startup)
- **Apply Filters**: Use the left sidebar to filter events by any column (multi-select with search)
- **Regex Filtering**: Type a regex pattern starting with `/` to use regex matching (e.g., `/demofile\d*\.[^/]+$`)
- **Change Chart Breakdown**: Select different fields to break down the time series chart
- **Browse Events**: Scroll through the paginated table of raw events
- **Download**: Export filtered data as CSV or Parquet

## API Endpoints

### GET `/api/data`

Fetch parquet data for a given date range.

**Parameters:**

- `start`: Start date (ISO format)
- `end`: End date (ISO format)

**Response:**

```json
{
  "data": [...],
  "total": 100
}
```

### POST `/api/query`

Execute a query with filters or custom SQL.

**Request Body:**

```json
{
  "filters": {
    "action": ["Read", "Write"],
    "username": ["integration-test"]
  },
  "substringFilters": {
    "filename": ["demo"]
  },
  "regexFilters": {
    "filename": ["/demofile\\d*\\.[^/]+$"]
  },
  "page": 1,
  "pageSize": 20,
  "sortColumn": "timestamp",
  "sortOrder": "DESC"
}
```

**Filter Types:**

- `filters`: Exact match filters (IN clause)
- `substringFilters`: Substring match filters (LIKE clause)
- `regexFilters`: Regex pattern filters (regexp_matches function)

**Response:**

```json
{
  "data": [...],
  "total": 50,
  "page": 1,
  "pageSize": 20
}
```

### GET `/api/columns`

Get column metadata and unique values for filters.

**Response:**

```json
{
  "columns": {
    "action": {
      "type": "object",
      "values": ["Read", "Write"]
    },
    ...
  }
}
```

## Data Schema

The application works with workspace audit events containing the following fields:

- `uuid`: Unique identifier for the event
- `deduplicationId`: Deduplication key combining action, filepath, user, and PID
- `timestamp`: Event timestamp (converted to ISO format)
- `filename`: Full path to the file being accessed
- `projectId`: Domino project ID
- `projectName`: Name of the project
- `userId`: User ID
- `username`: Username
- `hardwareTierId`: Hardware tier used
- `environmentName`: Domino environment name
- `workspaceName`: Name of the workspace
- `action`: Type of action performed (Read/Write)

## Design

The UI follows the Domino design system with:

- Dark navigation bar (#2e2e38)
- Light background (#fafafa)
- Primary purple accent (#543fde)
- Clean, modern interface with proper spacing and typography

## Regex Filtering Guide

The file path filter (and other filters) support regex patterns for advanced matching. To use regex:

1. **Start your search with `/`** - This tells the system you want to use regex instead of substring matching
2. **Type your pattern** - Use standard regex syntax
3. **Select the "Regex: /pattern/" option** from the dropdown

### Example Patterns

- `/demofile\d*\.[^/]+$` - Matches files named "demofile" followed by optional digits, with any extension

  - Matches: `demofile.txt`, `demofile123.py`, `/path/to/demofile99.csv`
  - Doesn't match: `demofile_backup.txt`, `demo.txt`

- `/\.py$` - Matches all Python files

  - Matches: `script.py`, `/code/main.py`
  - Doesn't match: `script.pyc`, `python.txt`

- `/^/home/[^/]+/data/` - Matches files in any user's data directory

  - Matches: `/home/user1/data/file.csv`, `/home/admin/data/report.xlsx`
  - Doesn't match: `/home/user1/documents/file.csv`

- `/test.*\.ipynb$` - Matches Jupyter notebooks starting with "test"
  - Matches: `test.ipynb`, `test_analysis.ipynb`, `testing.ipynb`
  - Doesn't match: `main.ipynb`, `test.py`

### Tips

- Regex patterns are case-sensitive by default
- Use `\d` for digits, `\w` for word characters, `.` for any character
- Use `+` for one or more, `*` for zero or more, `?` for optional
- Use `^` for start of string, `$` for end of string
- Invalid regex patterns will be highlighted and cannot be selected

## Performance Considerations

- **Caching**: Parquet files are cached locally per date range to avoid redundant downloads
- **Local Filtering**: Filters are applied using DuckDB SQL queries on cached data
- **Pagination**: Large datasets are paginated to maintain performance
- **Efficient Querying**: DuckDB provides fast SQL operations on Parquet files
- **Regex Performance**: Regex filters use DuckDB's `regexp_matches()` function, which is optimized for columnar data

## Notes

- The authorization token in `app.py` will need to be updated periodically
- Parquet files are stored in the system's temp directory under `workspace_audit_events`
- Date range changes trigger a fresh download from the Domino API
- Filters query the locally cached parquet data for instant results
