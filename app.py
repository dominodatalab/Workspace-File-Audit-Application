from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory, session, send_file
from flask_cors import CORS
import requests
import json
import tempfile
import os
import duckdb
import traceback
import logging
import pandas as pd
import io

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)


# Global cache for parquet data
parquet_cache = {
    'paths': [],  # List of parquet file paths
    'start': None,
    'end': None
}

def build_parquet_read_query():
    """Build a DuckDB query to read from all cached parquet files"""
    if not parquet_cache['paths']:
        raise ValueError('No parquet files loaded')
    
    if len(parquet_cache['paths']) == 1:
        # Single file - simple query
        return f"read_parquet('{parquet_cache['paths'][0]}')"
    else:
        # Multiple files - use list syntax to read and union all files
        paths_str = ', '.join([f"'{path}'" for path in parquet_cache['paths']])
        return f"read_parquet([{paths_str}])"

def download_parquet_data(start_date, end_date):
    """Download parquet files from Domino API for the given date range"""
    try:
        start_timestamp = int(start_date.timestamp())
        end_timestamp = int(end_date.timestamp())
       
        token = request.headers.get('authorization', '')
        host = request.headers.get('host', '')
        headers = {"authorization": token}
        
        url = f"https://{host}/api/workspace-audit/v1/events/download-urls?startTimestamp={start_timestamp}000000000&endTimestamp={end_timestamp}000000000"
        
        logger.info(f"Requesting download URLs from: {url}")
        response = requests.get(url, headers=headers)
        
        logger.info(f"Response status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"Received {len(data) if isinstance(data, list) else 0} download URLs")
            
            if data and isinstance(data, list):
                temp_dir = tempfile.gettempdir()
                parquet_dir = os.path.join(temp_dir, "workspace_audit_events")
                os.makedirs(parquet_dir, exist_ok=True)
                
                parquet_files = []
                for idx, download_url in enumerate(data):
                    filename = f"events_{idx}.parquet"
                    local_path = os.path.join(parquet_dir, filename)
                    
                    logger.info(f"Downloading parquet file {idx} to {local_path}")
                    parquet_response = requests.get(download_url)
                    
                    if parquet_response.status_code == 200:
                        with open(local_path, 'wb') as f:
                            f.write(parquet_response.content)
                        logger.info(f"Successfully saved {local_path} ({len(parquet_response.content)} bytes)")
                        parquet_files.append(local_path)
                    else:
                        logger.error(f"Failed to download parquet file: {parquet_response.status_code}")
                
                logger.info(f"Successfully downloaded {len(parquet_files)} parquet files")
                return parquet_files if parquet_files else None
            else:
                logger.warning("No download URLs received from API")
        else:
            logger.error(f"API request failed: {response.status_code} - {response.text}")
        
        return None
    except Exception as e:
        logger.error(f"Error in download_parquet_data: {str(e)}")
        logger.error(traceback.format_exc())
        return None

@app.route('/')
def index():
    """Serve the main UI"""
    return send_from_directory('static', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    """Get parquet data for the given date range and optional filters"""
    try:
        # Parse date range
        start = request.args.get('start')
        end = request.args.get('end')
        
        logger.info(f"Received request for date range: {start} to {end}")
        
        if not start or not end:
            return jsonify({'error': 'start and end dates are required'}), 400
        
        start_date = datetime.fromisoformat(start.replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(end.replace('Z', '+00:00'))
        # Make end date inclusive by adding one day (end of the selected day)
        end_date = end_date + timedelta(days=1)
        
 
        logger.info("Downloading new parquet data...")
        parquet_paths = download_parquet_data(start_date, end_date)
        if not parquet_paths:
            logger.error("Failed to download parquet data")
            return jsonify({'error': 'Failed to download data. Check server logs for details.'}), 500
        
        logger.info(f"Parquet data saved to {len(parquet_paths)} files: {parquet_paths}")
        parquet_cache['paths'] = parquet_paths
        parquet_cache['start'] = start
        parquet_cache['end'] = end
    
        # Query data using DuckDB
        conn = duckdb.connect(':memory:')
        
        # Base query - reads from all parquet files with timestamp filtering
        parquet_read = build_parquet_read_query()
        # Convert dates to nanoseconds (parquet stores timestamps in nanoseconds)
        start_ns = int(start_date.timestamp() * 1e9)
        end_ns = int(end_date.timestamp() * 1e9)
        query = f"SELECT * FROM {parquet_read} WHERE timestamp >= {start_ns} AND timestamp <= {end_ns}"
        logger.info(f"Executing query: {query}")
        
        # Execute query
        result = conn.execute(query).fetchdf()
        logger.info(f"Query returned {len(result)} rows")
        
        # Convert timestamp to readable format
        if 'timestamp' in result.columns:
            result['timestamp'] = (result['timestamp'] / 1e9).apply(
                lambda x: datetime.fromtimestamp(x).isoformat()
            )
        
        conn.close()
        
        return jsonify({
            'data': result.to_dict('records'),
            'total': len(result)
        })
    
    except Exception as e:
        logger.error(f"Error in get_data: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/sync/status', methods=['GET'])
def get_sync_data():   
    token = request.headers.get('authorization', '')
    host = request.headers.get('host', '')
    headers = {"authorization": token}

    url = f"https://{host}/api/workspace-audit/v1/process/latest"

    logger.info(f"Fetching data sync information: {url}")
    response = requests.get(url, headers=headers)

    return response.json()

@app.route('/api/sync', methods=['POST'])
def trigger_sync():   
    token = request.headers.get('authorization', '')
    host = request.headers.get('host', '')
    headers = {"authorization": token}

    url = f"https://{host}/api/workspace-audit/v1/process"

    logger.info(f"Triggering data sync: {url}")
    response = requests.post(url, headers=headers)

    return response.json()

@app.route('/api/query', methods=['POST'])
def query_data():
    """Execute a SQL query on the cached parquet data"""
    try:
        data = request.get_json()
        sql_query = data.get('query', '')
        filters = data.get('filters', {})
        substring_filters = data.get('substringFilters', {})
        regex_filters = data.get('regexFilters', {})
        page = data.get('page', 1)
        page_size = data.get('pageSize', 20)
        sort_column = data.get('sortColumn', 'timestamp')  # Default to timestamp
        sort_order = data.get('sortOrder', 'DESC')  # Default to descending (latest first)
        
        if not parquet_cache['paths']:
            return jsonify({'error': 'No data loaded. Please select a date range first.'}), 400
        
        conn = duckdb.connect(':memory:')
        
        # Get the parquet read expression for all files
        parquet_read = build_parquet_read_query()
        
        # Get timestamp range from cache for filtering
        start_date = datetime.fromisoformat(parquet_cache['start'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(parquet_cache['end'].replace('Z', '+00:00'))
        # Make end date inclusive by adding one day (end of the selected day)
        end_date = end_date + timedelta(days=1)
        start_ns = int(start_date.timestamp() * 1e9)
        end_ns = int(end_date.timestamp() * 1e9)

        # Start with base query
        if sql_query:
            # User provided custom SQL
            query = sql_query.replace('events', parquet_read)
        else:
            # Build query from filters
            query = f"SELECT * FROM {parquet_read}"
            
            conditions = []
            
            # Always add timestamp filtering
            conditions.append(f"timestamp >= {start_ns} AND timestamp <= {end_ns}")

            # Get all columns that have filters (exact, substring, or regex)
            all_filtered_columns = set()
            if filters:
                all_filtered_columns.update(filters.keys())
            if substring_filters:
                all_filtered_columns.update(substring_filters.keys())
            if regex_filters:
                all_filtered_columns.update(regex_filters.keys())

            # For each column, combine exact, substring, and regex filters with OR
            for column in all_filtered_columns:
                column_conditions = []

                # Add exact match conditions for this column
                if filters and column in filters and filters[column]:
                    values = filters[column]
                    escaped_values = [f"'{v.replace(chr(39), chr(39)+chr(39))}'" for v in values]
                    column_conditions.append(f"{column} IN ({','.join(escaped_values)})")

                # Add substring (LIKE) conditions for this column
                if substring_filters and column in substring_filters and substring_filters[column]:
                    search_terms = substring_filters[column]
                    for term in search_terms:
                        # Escape special characters for LIKE and escape single quotes
                        escaped_term = term.replace(chr(39), chr(39)+chr(39))
                        column_conditions.append(f"{column} LIKE '%{escaped_term}%'")

                # Add regex conditions for this column
                if regex_filters and column in regex_filters and regex_filters[column]:
                    regex_patterns = regex_filters[column]
                    for pattern in regex_patterns:
                        # Extract the regex pattern (remove leading /)
                        if pattern.startswith('/'):
                            regex_pattern = pattern[1:]
                        else:
                            regex_pattern = pattern
                        # Escape single quotes in the pattern
                        escaped_pattern = regex_pattern.replace(chr(39), chr(39)+chr(39))
                        # Use DuckDB's regexp_matches function
                        column_conditions.append(f"regexp_matches({column}, '{escaped_pattern}')")

                # Combine conditions for this column with OR, then wrap in parentheses
                if column_conditions:
                    if len(column_conditions) == 1:
                        conditions.append(column_conditions[0])
                    else:
                        conditions.append(f"({' OR '.join(column_conditions)})")
            
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
        
        # Add ORDER BY clause
        # Validate sort_column exists and sort_order is valid
        valid_sort_orders = ['ASC', 'DESC']
        if sort_order.upper() not in valid_sort_orders:
            sort_order = 'DESC'
        
        # For timestamp sorting, we need to sort by the numeric value before conversion
        order_by_clause = f" ORDER BY {sort_column} {sort_order.upper()}"
        query += order_by_clause
        
        logger.info(f"Query with sorting: {query[:200]}...")
        logger.info(f"Sort params: column={sort_column}, order={sort_order}, page={page}, page_size={page_size}")
        
        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM ({query.replace(order_by_clause, '')}) as subquery"
        total = conn.execute(count_query).fetchone()[0]
        
        # Get ALL filtered data for chart (without pagination, but sorted)
        all_filtered_result = conn.execute(query).fetchdf()
        
        # Add pagination for table data
        offset = (page - 1) * page_size
        paginated_query = query + f" LIMIT {page_size} OFFSET {offset}"
        
        logger.info(f"Paginated query: {paginated_query[:200]}... OFFSET {offset}")
        
        # Execute paginated query for table
        result = conn.execute(paginated_query).fetchdf()
        
        logger.info(f"Query results: total={total}, chart_rows={len(all_filtered_result)}, table_rows={len(result)}")
        
        # Convert timestamp to readable format for both datasets
        if 'timestamp' in result.columns:
            result['timestamp'] = (result['timestamp'] / 1e9).apply(
                lambda x: datetime.fromtimestamp(x).isoformat()
            )
        
        if 'timestamp' in all_filtered_result.columns:
            all_filtered_result['timestamp'] = (all_filtered_result['timestamp'] / 1e9).apply(
                lambda x: datetime.fromtimestamp(x).isoformat()
            )
        
        conn.close()
        
        return jsonify({
            'data': result.to_dict('records'),
            'chartData': all_filtered_result.to_dict('records'),  # All filtered data for chart
            'total': total,
            'page': page,
            'pageSize': page_size
        })
    
    except Exception as e:
        logger.error(f"Error in query_data: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/columns', methods=['GET'])
def get_columns():
    """Get column names and unique values for filters"""
    try:
        if not parquet_cache['paths']:
            return jsonify({'error': 'No data loaded. Please select a date range first.'}), 400

        conn = duckdb.connect(':memory:')

        # Get all data from all parquet files with timestamp filtering
        parquet_read = build_parquet_read_query()
        start_date = datetime.fromisoformat(parquet_cache['start'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(parquet_cache['end'].replace('Z', '+00:00'))
        # Make end date inclusive by adding one day (end of the selected day) - same as /api/data
        end_date = end_date + timedelta(days=1)
        start_ns = int(start_date.timestamp() * 1e9)
        end_ns = int(end_date.timestamp() * 1e9)
        result = conn.execute(f"SELECT * FROM {parquet_read} WHERE timestamp >= {start_ns} AND timestamp <= {end_ns}").fetchdf()
        
        # Build column metadata
        columns = {}
        for col in result.columns:
            if col != 'timestamp':  # Exclude timestamp from filters
                unique_values = result[col].dropna().unique().tolist()
                columns[col] = {
                    'type': str(result[col].dtype),
                    'values': sorted(unique_values)[:1000]  # Limit to 1000 unique values
                }
        
        conn.close()
        
        return jsonify({
            'columns': columns,
            'columnLabels': COLUMN_NAME_MAPPING
        })
    
    except Exception as e:
        logger.error(f"Error in get_columns: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/filtered-columns', methods=['POST'])
def get_filtered_columns():
    """Get available column values based on current filters (for cascading filters)"""
    try:
        if not parquet_cache['paths']:
            return jsonify({'error': 'No data loaded. Please select a date range first.'}), 400
        
        data = request.get_json()
        filters = data.get('filters', {})
        substring_filters = data.get('substringFilters', {})
        regex_filters = data.get('regexFilters', {})
        exclude_column = data.get('excludeColumn')  # Column to exclude from filtering
        
        conn = duckdb.connect(':memory:')
        
        # Get the parquet read expression for all files
        parquet_read = build_parquet_read_query()
        
        # Get timestamp range from cache for filtering
        start_date = datetime.fromisoformat(parquet_cache['start'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(parquet_cache['end'].replace('Z', '+00:00'))
        # Make end date inclusive by adding one day (end of the selected day)
        end_date = end_date + timedelta(days=1)
        start_ns = int(start_date.timestamp() * 1e9)
        end_ns = int(end_date.timestamp() * 1e9)

        # For each column, we'll calculate available values by applying all OTHER filters
        all_columns = []
        result = conn.execute(f"SELECT * FROM {parquet_read} LIMIT 1").fetchdf()
        all_columns = [col for col in result.columns if col != 'timestamp']
        
        columns = {}
        
        for target_column in all_columns:
            # Build query excluding the target column's own filters
            query = f"SELECT DISTINCT {target_column} FROM {parquet_read}"
            
            conditions = []
            
            # Always add timestamp filtering
            conditions.append(f"timestamp >= {start_ns} AND timestamp <= {end_ns}")

            # Get all columns that have filters (exact, substring, or regex)
            all_filtered_columns = set()
            if filters:
                all_filtered_columns.update(filters.keys())
            if substring_filters:
                all_filtered_columns.update(substring_filters.keys())
            if regex_filters:
                all_filtered_columns.update(regex_filters.keys())

            # For each column EXCEPT the target column, add its filters
            for column in all_filtered_columns:
                # Skip the target column - we want to see all possible values for it
                if column == target_column:
                    continue

                column_conditions = []

                # Add exact match conditions for this column
                if filters and column in filters and filters[column]:
                    values = filters[column]
                    escaped_values = [f"'{v.replace(chr(39), chr(39)+chr(39))}'" for v in values]
                    column_conditions.append(f"{column} IN ({','.join(escaped_values)})")

                # Add substring (LIKE) conditions for this column
                if substring_filters and column in substring_filters and substring_filters[column]:
                    search_terms = substring_filters[column]
                    for term in search_terms:
                        escaped_term = term.replace(chr(39), chr(39)+chr(39))
                        column_conditions.append(f"{column} LIKE '%{escaped_term}%'")

                # Add regex conditions for this column
                if regex_filters and column in regex_filters and regex_filters[column]:
                    regex_patterns = regex_filters[column]
                    for pattern in regex_patterns:
                        # Extract the regex pattern (remove leading /)
                        if pattern.startswith('/'):
                            regex_pattern = pattern[1:]
                        else:
                            regex_pattern = pattern
                        # Escape single quotes in the pattern
                        escaped_pattern = regex_pattern.replace(chr(39), chr(39)+chr(39))
                        # Use DuckDB's regexp_matches function
                        column_conditions.append(f"regexp_matches({column}, '{escaped_pattern}')")

                # Combine conditions for this column with OR
                if column_conditions:
                    if len(column_conditions) == 1:
                        conditions.append(column_conditions[0])
                    else:
                        conditions.append(f"({' OR '.join(column_conditions)})")
            
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            
            query += f" ORDER BY {target_column}"
            
            # Get available values for this column
            try:
                col_result = conn.execute(query).fetchdf()
                unique_values = col_result[target_column].dropna().unique().tolist()
                columns[target_column] = {
                    'type': str(col_result[target_column].dtype),
                    'values': sorted(unique_values)[:1000]  # Limit to 1000 unique values
                }
            except Exception as e:
                logger.error(f"Error getting values for column {target_column}: {str(e)}")
                # If there's an error, use empty list
                columns[target_column] = {
                    'type': 'object',
                    'values': []
                }
        
        conn.close()
        
        return jsonify({'columns': columns})
    
    except Exception as e:
        logger.error(f"Error in get_filtered_columns: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

# Human-readable column name mappings
COLUMN_NAME_MAPPING = {
    'timestamp': 'Timestamp',
    'username': 'Username',
    'action': 'Event',
    'filename': 'File path',
    'projectName': 'Project Name',
    'workspaceName': 'Workspace Name',
    'environmentName': 'Environment Name',
    'hardwareTierId': 'Hardware Tier',
    'projectId': 'Project ID',
    'userId': 'User ID',
    'uuid': 'UUID',
    'deduplicationId': 'Deduplication ID'
}

def get_filtered_data_for_download(filters, substring_filters, regex_filters):
    """Get all filtered data (not paginated) for download"""
    if not parquet_cache['paths']:
        raise ValueError('No data loaded. Please select a date range first.')

    conn = duckdb.connect(':memory:')

    # Get the parquet read expression for all files
    parquet_read = build_parquet_read_query()

    # Get timestamp range from cache for filtering
    start_date = datetime.fromisoformat(parquet_cache['start'].replace('Z', '+00:00'))
    end_date = datetime.fromisoformat(parquet_cache['end'].replace('Z', '+00:00'))
    # Make end date inclusive by adding one day (end of the selected day)
    end_date = end_date + timedelta(days=1)
    start_ns = int(start_date.timestamp() * 1e9)
    end_ns = int(end_date.timestamp() * 1e9)

    # Build query from filters (similar to query_data but without pagination)
    query = f"SELECT * FROM {parquet_read}"

    conditions = []

    # Always add timestamp filtering
    conditions.append(f"timestamp >= {start_ns} AND timestamp <= {end_ns}")

    # Get all columns that have filters (exact, substring, or regex)
    all_filtered_columns = set()
    if filters:
        all_filtered_columns.update(filters.keys())
    if substring_filters:
        all_filtered_columns.update(substring_filters.keys())
    if regex_filters:
        all_filtered_columns.update(regex_filters.keys())

    # For each column, combine exact, substring, and regex filters with OR
    for column in all_filtered_columns:
        column_conditions = []

        # Add exact match conditions for this column
        if filters and column in filters and filters[column]:
            values = filters[column]
            escaped_values = [f"'{v.replace(chr(39), chr(39)+chr(39))}'" for v in values]
            column_conditions.append(f"{column} IN ({','.join(escaped_values)})")

        # Add substring (LIKE) conditions for this column
        if substring_filters and column in substring_filters and substring_filters[column]:
            search_terms = substring_filters[column]
            for term in search_terms:
                # Escape special characters for LIKE and escape single quotes
                escaped_term = term.replace(chr(39), chr(39)+chr(39))
                column_conditions.append(f"{column} LIKE '%{escaped_term}%'")

        # Add regex conditions for this column
        if regex_filters and column in regex_filters and regex_filters[column]:
            regex_patterns = regex_filters[column]
            for pattern in regex_patterns:
                # Extract the regex pattern (remove leading /)
                if pattern.startswith('/'):
                    regex_pattern = pattern[1:]
                else:
                    regex_pattern = pattern
                # Escape single quotes in the pattern
                escaped_pattern = regex_pattern.replace(chr(39), chr(39)+chr(39))
                # Use DuckDB's regexp_matches function
                column_conditions.append(f"regexp_matches({column}, '{escaped_pattern}')")

        # Combine conditions for this column with OR, then wrap in parentheses
        if column_conditions:
            if len(column_conditions) == 1:
                conditions.append(column_conditions[0])
            else:
                conditions.append(f"({' OR '.join(column_conditions)})")
    
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    # Execute query to get all filtered data
    result = conn.execute(query).fetchdf()
    
    # Convert timestamp to readable format
    if 'timestamp' in result.columns:
        result['timestamp'] = (result['timestamp'] / 1e9).apply(
            lambda x: datetime.fromtimestamp(x).isoformat()
        )
    
    conn.close()
    
    # Rename columns to human-readable names
    rename_mapping = {col: COLUMN_NAME_MAPPING.get(col, col) for col in result.columns}
    result = result.rename(columns=rename_mapping)
    
    return result

@app.route('/api/download/csv', methods=['POST'])
def download_csv():
    """Download filtered data as CSV"""
    try:
        data = request.get_json()
        filters = data.get('filters', {})
        substring_filters = data.get('substringFilters', {})
        regex_filters = data.get('regexFilters', {})

        # Get filtered data
        df = get_filtered_data_for_download(filters, substring_filters, regex_filters)
        
        # Convert to CSV
        output = io.StringIO()
        df.to_csv(output, index=False)
        output.seek(0)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'workspace_audit_events_{timestamp}.csv'
        
        return send_file(
            io.BytesIO(output.getvalue().encode('utf-8')),
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
    
    except Exception as e:
        logger.error(f"Error in download_csv: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/download/parquet', methods=['POST'])
def download_parquet():
    """Download filtered data as Parquet"""
    try:
        data = request.get_json()
        filters = data.get('filters', {})
        substring_filters = data.get('substringFilters', {})
        regex_filters = data.get('regexFilters', {})

        # Get filtered data
        df = get_filtered_data_for_download(filters, substring_filters, regex_filters)
        
        # Convert to Parquet
        output = io.BytesIO()
        df.to_parquet(output, index=False, engine='pyarrow')
        output.seek(0)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'workspace_audit_events_{timestamp}.parquet'
        
        return send_file(
            output,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=filename
        )
    
    except Exception as e:
        logger.error(f"Error in download_parquet: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

if __name__ == '__main__':
    
    
    app.run(debug=True, port=5000)