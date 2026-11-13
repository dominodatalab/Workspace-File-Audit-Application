from datetime import datetime, timedelta, timezone
from flask import Flask, jsonify, request, send_from_directory, session, send_file
from flask_cors import CORS
import requests
import json
import tempfile
import os
import re
import duckdb
import traceback
import logging
import pandas as pd
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import unquote, urlparse

from helpers import safe_api_request

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# ============================================================================
# DATA MANAGEMENT
# ============================================================================

# Global cache for parquet data
parquet_cache = {
    'paths': [],  # List of parquet file paths
    'dir': None,  # Directory holding the files of the current load
    'start': None,
    'end': None
}

NANOSECONDS_PER_SECOND = 1_000_000_000
NANOSECONDS_PER_DAY = 24 * 60 * 60 * NANOSECONDS_PER_SECOND
UNIX_EPOCH = datetime(1970, 1, 1)
DOWNLOAD_WORKERS = int(os.environ.get('DOWNLOAD_WORKERS', '8'))
DOWNLOAD_TIMEOUT_SECONDS = 60
DOWNLOAD_RETRIES = int(os.environ.get('DOWNLOAD_RETRIES', '3'))
DOWNLOAD_RETRY_BACKOFF_SECONDS = float(os.environ.get('DOWNLOAD_RETRY_BACKOFF_SECONDS', '1'))
DOWNLOAD_CHUNK_SIZE = 1024 * 1024
DUCKDB_MEMORY_LIMIT = os.environ.get('DUCKDB_MEMORY_LIMIT', '2GB')
DUCKDB_THREADS = int(os.environ.get('DUCKDB_THREADS', '4'))
DUCKDB_TEMP_DIRECTORY = os.path.join(tempfile.gettempdir(), 'workspace_audit_duckdb')
COLUMN_VALUES_LIMIT = 1000
PAGINATION_KEY = 'uuid'
DAILY_FILE_PATTERN = re.compile(r'/daily/\d{4}/\d{2}/events_(\d{4})_(\d{2})_(\d{2})\.parquet$')
MONTHLY_FILE_PATTERN = re.compile(r'/events_(\d{1,2})_(\d{4})\.parquet$')


_database = None
_database_lock = threading.Lock()


def connect():
    """
    Open a connection to the shared in-memory DuckDB database. All requests share the one database, so its memory and
    thread limits bound the whole app however many requests run at once. Work that does not fit in the memory limit
    spills to a temporary directory on disk. The database is created on first use under a lock, so that concurrent
    first requests in the worker's threads all get cursors from the same database instead of each creating their own.

    :return: A DuckDB connection for the current request, to be closed by the caller.
    """
    global _database
    if _database is None:
        with _database_lock:
            if _database is None:
                os.makedirs(DUCKDB_TEMP_DIRECTORY, exist_ok=True)
                _database = duckdb.connect(':memory:', config={
                    'memory_limit': DUCKDB_MEMORY_LIMIT,
                    'threads': DUCKDB_THREADS,
                    'temp_directory': DUCKDB_TEMP_DIRECTORY,
                    'preserve_insertion_order': False,
                })
    return _database.cursor()


def sql_string(value):
    """
    Quote a value as a SQL string literal.

    :param value: The value to quote.
    :return: The quoted literal.
    """
    return "'" + str(value).replace("'", "''") + "'"


class InvalidRequestError(ValueError):
    """Raised when a request asks for something the loaded data cannot answer, reported to the caller as a 400."""


def quote_identifier(name):
    """
    Quote a name as a SQL identifier.

    :param name: The identifier.
    :return: The quoted identifier.
    """
    return '"' + str(name).replace('"', '""') + '"'


def as_list(value):
    """
    Normalize a filter value to a list of values.

    :param value: A single value or a list of values.
    :return: The values as a list.
    """
    return value if isinstance(value, list) else [value]


def build_filter_conditions(available_columns, filters, substring_filters, regex_filters, exclude_column=None):
    """
    Build the SQL conditions for the exact, substring and regex filters of a request. Filters on the same column are
    combined with OR, and filters on different columns with AND. Filter keys come from the request, so they must name a
    column of the loaded events and are quoted as identifiers, and every filter value is quoted as a string literal:
    request input can only ever be compared against, never change the statement itself.

    :param available_columns: The columns of the loaded events.
    :param filters: Exact match filters, as a map from column to values.
    :param substring_filters: Substring filters, as a map from column to search terms.
    :param regex_filters: Regex filters, as a map from column to patterns, optionally starting with '/'.
    :param exclude_column: A column whose own filters are skipped, if any.
    :return: The list of SQL conditions.
    :raises InvalidRequestError: If a filter key is not a column of the loaded events.
    """
    filters = filters or {}
    substring_filters = substring_filters or {}
    regex_filters = regex_filters or {}
    filtered_columns = set(filters) | set(substring_filters) | set(regex_filters)
    unknown_columns = filtered_columns - set(available_columns)
    if unknown_columns:
        raise InvalidRequestError(f"Cannot filter by unknown column(s): {', '.join(sorted(map(str, unknown_columns)))}")

    conditions = []
    for column in sorted(filtered_columns):
        if column == exclude_column:
            continue
        identifier = quote_identifier(column)
        column_conditions = []
        if filters.get(column):
            values = ', '.join(sql_string(value) for value in as_list(filters[column]))
            column_conditions.append(f"{identifier} IN ({values})")
        for term in as_list(substring_filters.get(column) or []):
            column_conditions.append(f"{identifier} LIKE {sql_string('%' + str(term) + '%')}")
        for pattern in as_list(regex_filters.get(column) or []):
            pattern = str(pattern)
            column_conditions.append(f"regexp_matches({identifier}, {sql_string(pattern[1:] if pattern.startswith('/') else pattern)})")
        if len(column_conditions) == 1:
            conditions.append(column_conditions[0])
        elif column_conditions:
            conditions.append(f"({' OR '.join(column_conditions)})")
    return conditions


def ensure_single_select(query):
    """
    Check that a query is exactly one SELECT statement, so that custom SQL cannot run other statements such as COPY,
    whether on its own or by closing the query it is embedded in and starting another one.

    :param query: The complete query to run.
    :raises InvalidRequestError: If the query does not parse or is not a single SELECT statement.
    """
    try:
        statements = duckdb.extract_statements(query)
    except duckdb.Error as e:
        raise InvalidRequestError(f"Invalid SQL query: {e}") from e
    if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
        raise InvalidRequestError("Only a single SELECT query is allowed.")


def classify_aggregate_url(url):
    """
    Identify which aggregated events file a presigned download URL points to.

    :param url: The presigned download URL.
    :return: Tuple of (kind, period) where kind is 'daily', 'monthly' or 'other'. The period is the day number since the
        Unix epoch for a daily file, the (year, month) for a monthly file, and None otherwise.
    """
    path = unquote(urlparse(url).path)
    daily = DAILY_FILE_PATTERN.search(path)
    if daily:
        day = datetime(int(daily.group(1)), int(daily.group(2)), int(daily.group(3)))
        return 'daily', (day - datetime(1970, 1, 1)).days
    monthly = MONTHLY_FILE_PATTERN.search(path)
    if monthly:
        return 'monthly', (int(monthly.group(2)), int(monthly.group(1)))
    return 'other', None


def parse_utc(value):
    """
    Parse an ISO date or date-time, reading it as UTC unless it states its own offset. Python reads naive values in
    the server's local time zone, which would shift the selected dates whenever the server is not set to UTC.

    :param value: The ISO date or date-time, e.g. 2025-10-14.
    :return: A time zone aware datetime.
    """
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def format_utc_timestamp(timestamp_ns):
    """
    Format a nanosecond Unix timestamp as an ISO 8601 UTC date-time without an offset, truncated to microseconds.
    Integer arithmetic is used since converting to float seconds rounds the last microseconds of a second up to the
    next second, or even the next day.

    :param timestamp_ns: The timestamp in nanoseconds since the Unix epoch.
    :return: The formatted date-time, e.g. 2025-10-15T23:59:59.999999.
    """
    return (UNIX_EPOCH + timedelta(microseconds=int(timestamp_ns) // 1000)).isoformat()


def get_range_ns(start, end):
    """
    Convert the selected start and end dates into a half-open nanosecond range [start_ns, end_ns) that covers the
    whole end day. Dates are UTC days, matching the UTC daily aggregated files and the UTC times shown in the UI.

    :param start: Start date in ISO format.
    :param end: End date in ISO format, inclusive.
    :return: Tuple of (start_ns, end_ns), where end_ns is the first nanosecond after the end day.
    """
    start_date = parse_utc(start)
    end_date = parse_utc(end) + timedelta(days=1)
    return int(start_date.timestamp()) * NANOSECONDS_PER_SECOND, int(end_date.timestamp()) * NANOSECONDS_PER_SECOND


def get_cached_range_ns():
    """
    Get the half-open nanosecond range [start_ns, end_ns) of the currently loaded date range.

    :return: Tuple of (start_ns, end_ns).
    """
    return get_range_ns(parquet_cache['start'], parquet_cache['end'])


def timestamp_condition(start_ns, end_ns):
    """
    Build the SQL condition restricting events to the half-open range [start_ns, end_ns).

    :param start_ns: Inclusive start of the range in nanoseconds.
    :param end_ns: Exclusive end of the range in nanoseconds.
    :return: SQL condition string.
    """
    return f"timestamp >= {start_ns} AND timestamp < {end_ns}"

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

class DownloadError(Exception):
    """Raised when an aggregated events file could not be downloaded, even after retries."""

def is_retryable_status(status_code):
    """
    Tell whether a failed download may succeed if retried.

    :param status_code: The HTTP status code of the failed download.
    :return: True for rate limiting and server errors, False for other errors such as an expired or invalid URL.
    """
    return status_code == 429 or status_code >= 500


def download_file(url, local_path):
    """
    Stream a single file to disk, retrying transient failures (connection errors, timeouts, interrupted transfers,
    rate limiting and server errors).

    :param url: The presigned URL to download.
    :param local_path: The local path to write the file to.
    :return: The local path.
    :raises DownloadError: If the file could not be downloaded.
    """
    attempts = 1 + max(0, DOWNLOAD_RETRIES)
    for attempt in range(1, attempts + 1):
        try:
            with requests.get(url, timeout=DOWNLOAD_TIMEOUT_SECONDS, stream=True) as response:
                if response.status_code != 200:
                    error = f"HTTP {response.status_code}"
                    retryable = is_retryable_status(response.status_code)
                else:
                    with open(local_path, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=DOWNLOAD_CHUNK_SIZE):
                            f.write(chunk)
                    logger.info(f"Downloaded file to {local_path} ({os.path.getsize(local_path)} bytes)")
                    return local_path
        except requests.exceptions.RequestException as download_error:
            error = type(download_error).__name__
            retryable = True

        if os.path.exists(local_path):
            os.remove(local_path)
        if not retryable or attempt == attempts:
            logger.error(f"A file failed to download after {attempt} attempt(s): {error}")
            raise DownloadError(error)
        delay = DOWNLOAD_RETRY_BACKOFF_SECONDS * (2 ** (attempt - 1))
        logger.warning(f"A file failed to download (attempt {attempt} of {attempts}): {error}; retrying in {delay:g}s")
        time.sleep(delay)


def download_files(urls, local_paths):
    """
    Download all the files in parallel. A load must never show partial data, so if any file cannot be downloaded the
    whole download fails.

    :param urls: The presigned URLs to download.
    :param local_paths: The local paths to write the files to, in the same order.
    :raises DownloadError: If any file could not be downloaded.
    """
    failures = []
    with ThreadPoolExecutor(max_workers=max(1, DOWNLOAD_WORKERS)) as executor:
        futures = [executor.submit(download_file, url, path) for url, path in zip(urls, local_paths)]
        for future in futures:
            try:
                future.result()
            except DownloadError as e:
                failures.append(str(e))
    if failures:
        raise DownloadError(f"{len(failures)} of {len(urls)} files failed to download")


def consolidate_parquet_files(files, output_path, start_ns, end_ns):
    """
    Combine the downloaded files into a single Parquet file holding only the events within the range. 
    Files are combined by column name so that files written with an older schema can be read together with newer ones.

    :param files: The downloaded files, as a list of (path, kind, period) tuples from classify_aggregate_url.
    :param output_path: The path of the combined Parquet file to write.
    :param start_ns: Inclusive start of the range in nanoseconds.
    :param end_ns: Exclusive end of the range in nanoseconds.
    """
    covered_days = {}
    for _, kind, period in files:
        if kind == 'daily':
            day = datetime(1970, 1, 1) + timedelta(days=period)
            covered_days.setdefault((day.year, day.month), []).append(str(period))

    parts = []
    for path, kind, period in files:
        part = f"SELECT * FROM read_parquet({sql_string(path)})"
        if kind == 'monthly' and covered_days.get(period):
            part += f" WHERE timestamp // {NANOSECONDS_PER_DAY} NOT IN ({', '.join(covered_days[period])})"
        parts.append(part)

    conn = connect()
    try:
        conn.execute(f"""
            COPY (
                SELECT * FROM ({' UNION ALL BY NAME '.join(parts)})
                WHERE {timestamp_condition(start_ns, end_ns)}
            ) TO {sql_string(output_path)} (FORMAT 'parquet')
        """)
    finally:
        conn.close()


def download_parquet_data(start_ns, end_ns):
    """
    Download the aggregated event files for the given range from the Domino API and combine them into a single
    Parquet file without duplicates in a new directory.

    :param start_ns: Inclusive start of the range in nanoseconds.
    :param end_ns: Exclusive end of the range in nanoseconds.
    :return: Tuple of (paths, directory): ([combined_path], directory) on success, ([], None) if there is no data for
        the range, and (None, None) on failure.
    :raises DownloadError: If any file could not be downloaded after retries.
    """
    token = request.headers.get('authorization', '')
    host = request.headers.get('host', '')
    headers = {"authorization": token}

    url = f"https://{host}/api/workspace-audit/v1/events/download-urls?startTimestamp={start_ns}&endTimestamp={end_ns - 1}"

    success, data, error_msg, _ = safe_api_request(url, headers=headers)

    if not success:
        logger.error(f"Failed to get download URLs: {error_msg}")
        return None, None

    logger.info(f"Received {len(data) if isinstance(data, list) else 0} download URLs")

    if isinstance(data, list) and len(data) == 0:
        logger.warning("Received empty list of download URLs from API")
        return [], None

    if not data or not isinstance(data, list):
        logger.warning("No download URLs received from API")
        return None, None

    load_dir = None
    try:
        parquet_dir = os.path.join(tempfile.gettempdir(), "workspace_audit_events")
        os.makedirs(parquet_dir, exist_ok=True)
        load_dir = tempfile.mkdtemp(prefix="load-", dir=parquet_dir)

        local_paths = [os.path.join(load_dir, f"download_{idx}.parquet") for idx in range(len(data))]
        download_files(data, local_paths)
        downloaded = [(path, *classify_aggregate_url(url)) for url, path in zip(data, local_paths)]
        logger.info(f"Downloaded all {len(downloaded)} parquet files")

        combined_path = os.path.join(load_dir, "events.parquet")
        consolidate_parquet_files(downloaded, combined_path, start_ns, end_ns)
        for path, _, _ in downloaded:
            os.remove(path)

        return [combined_path], load_dir

    except DownloadError:
        if load_dir:
            shutil.rmtree(load_dir, ignore_errors=True)
        raise
    except Exception as e:
        logger.error(f"Error in download_parquet_data: {str(e)}")
        logger.error(traceback.format_exc())
        if load_dir:
            shutil.rmtree(load_dir, ignore_errors=True)
        return None, None

@app.route('/')
def index():
    """Serve the main UI"""
    return send_from_directory('static', 'index.html')

@app.route('/api/data/load', methods=['POST'])
def load_data():
    """
    Download and cache the events for the date range given in the JSON body as start and end. Only the number of
    events is returned; the events themselves are served page by page through /api/data/query.
    """
    try:
        body = request.get_json(silent=True) or {}
        start = body.get('start')
        end = body.get('end')

        logger.info(f"Received request for date range: {start} to {end}")

        if not start or not end:
            return jsonify({'error': 'start and end dates are required'}), 400

        start_ns, end_ns = get_range_ns(start, end)

        logger.info("Downloading new parquet data...")
        try:
            parquet_paths, load_dir = download_parquet_data(start_ns, end_ns)
        except DownloadError as e:
            logger.error(f"Failed to load data, keeping the previously loaded data: {e}")
            return jsonify({'error': f'Could not load the selected date range: {e}. The previously loaded data is unchanged.'}), 502
        if isinstance(parquet_paths, list) and len(parquet_paths) == 0:
            logger.warning("No parquet files found for the given date range")
            return jsonify({'error': 'No data available for the selected date range.'}), 404

        if not parquet_paths:
            logger.error("Failed to download parquet data")
            return jsonify({'error': 'Failed to download data. Check server logs for details.'}), 500

        logger.info(f"Parquet data saved to {len(parquet_paths)} files: {parquet_paths}")
        previous_dir = parquet_cache['dir']
        parquet_cache['paths'] = parquet_paths
        parquet_cache['dir'] = load_dir
        parquet_cache['start'] = start
        parquet_cache['end'] = end
        if previous_dir and previous_dir != load_dir:
            shutil.rmtree(previous_dir, ignore_errors=True)

        conn = connect()
        try:
            parquet_read = build_parquet_read_query()
            total = conn.execute(f"SELECT COUNT(*) FROM {parquet_read} WHERE {timestamp_condition(start_ns, end_ns)}").fetchone()[0]
        finally:
            conn.close()
        logger.info(f"Loaded {total} events for the date range")

        return jsonify({'total': total})

    except Exception as e:
        logger.error(f"Error in load_data: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/sync/status', methods=['GET'])
def get_sync_data():
    token = request.headers.get('authorization', '')
    host = request.headers.get('host', '')
    headers = {"authorization": token}

    url = f"https://{host}/api/workspace-audit/v1/process/latest"

    success, data, error_msg, status_code = safe_api_request(url, headers=headers)

    if not success:
        return jsonify({
            'error': error_msg,
            'status': 'error'
        }), status_code

    return jsonify(data)

@app.route('/api/sync', methods=['POST'])
def trigger_sync():
    token = request.headers.get('authorization', '')
    host = request.headers.get('host', '')
    headers = {"authorization": token}

    url = f"https://{host}/api/workspace-audit/v1/process"

    success, data, error_msg, status_code = safe_api_request(url, headers=headers, method='POST')

    if not success:
        return jsonify({
            'error': error_msg,
            'status': 'error'
        }), status_code

    return jsonify(data)

@app.route('/api/data/query', methods=['POST'])
def query_data():
    """Execute a SQL query on the cached parquet data"""
    try:
        data = request.get_json()
        sql_query = data.get('query', '')
        filters = data.get('filters', {})
        substring_filters = data.get('substringFilters', {})
        regex_filters = data.get('regexFilters', {})
        page = data.get('page', 1)
        page_size = data.get('pageSize', 100)
        sort_column = data.get('sortColumn', 'timestamp')  # Default to timestamp
        sort_order = data.get('sortOrder', 'DESC')  # Default to descending (latest first)
        selected_field = data.get('selectedField', None)
        
        if not parquet_cache['paths']:
            return jsonify({'error': 'No data loaded. Please select a date range first.'}), 400
        
        conn = connect()
        
        # Get the parquet read expression for all files
        parquet_read = build_parquet_read_query()
        
        # Get timestamp range from cache for filtering
        start_ns, end_ns = get_cached_range_ns()

        # Start with base query
        if sql_query:
            # User provided custom SQL, wrapped so that sorting and pagination apply to its result
            query = f"SELECT * FROM ({sql_query.replace('events', parquet_read)}) AS custom_query"
            ensure_single_select(query)
        else:
            # Build query from filters
            query = f"SELECT * FROM {parquet_read}"
            
            conditions = []
            
            # Always add timestamp filtering
            conditions.append(timestamp_condition(start_ns, end_ns))

            available_columns = [col for col, _ in get_column_types(conn, parquet_read)]
            conditions += build_filter_conditions(available_columns, filters, substring_filters, regex_filters)

            if conditions:
                query += " WHERE " + " AND ".join(conditions)
        
        # Validate sort_order and sort_column
        valid_sort_orders = ['ASC', 'DESC']
        if sort_order.upper() not in valid_sort_orders:
            sort_order = 'DESC'

        base_query = query
        projected_columns = [column[0] for column in conn.execute(f"SELECT * FROM ({base_query}) AS projection LIMIT 0").description]
        if sort_column not in projected_columns:
            if sql_query and sort_column == 'timestamp':
                sort_column = None
            else:
                conn.close()
                return jsonify({'error': f"Cannot sort by '{sort_column}': the column is not in the query results."}), 400

        logger.info(f"Sort params: column={sort_column}, order={sort_order}, page={page}, page_size={page_size}")

        # Get total count
        count_query = f"SELECT COUNT(*) as total FROM ({base_query}) as subquery"
        total = conn.execute(count_query).fetchone()[0]

        if PAGINATION_KEY not in projected_columns and total > page_size:
            conn.close()
            return jsonify({'error': f"The query returns more than one page of results, so it must include the '{PAGINATION_KEY}' column to be paginated consistently. Add it to the SELECT, or narrow the query to at most {page_size} rows."}), 400

        order_by = [f'{quote_identifier(sort_column)} {sort_order.upper()}'] if sort_column else []
        if PAGINATION_KEY in projected_columns and sort_column != PAGINATION_KEY:
            order_by.append(f'{quote_identifier(PAGINATION_KEY)} ASC')
        query = base_query + (f" ORDER BY {', '.join(order_by)}" if order_by else "")
        logger.info(f"Query with sorting: {query[:200]}...")

        # Determine time bucket size based on date range (mirrors frontend logic)
        days_diff = (end_ns - start_ns) // NANOSECONDS_PER_DAY
        if days_diff <= 1:
            bucket_size = 'hour'
        elif days_diff <= 60:
            bucket_size = 'day'
        elif days_diff <= 365:
            bucket_size = 'week'
        else:
            bucket_size = 'month'

        # Build server-side aggregated chart data
        if selected_field and selected_field in projected_columns:
            field_identifier = quote_identifier(selected_field)
            top_values_df = conn.execute(f"""
                SELECT CAST({field_identifier} AS VARCHAR) AS field_value, COUNT(*) AS cnt
                FROM ({base_query}) AS sub
                GROUP BY {field_identifier}
                ORDER BY cnt DESC
                LIMIT 10
            """).fetchdf()
            top_values = [str(v) for v in top_values_df['field_value'].tolist() if v is not None]
            if top_values:
                escaped = [sql_string(v) for v in top_values]
                field_expr = f"CASE WHEN CAST({field_identifier} AS VARCHAR) IN ({','.join(escaped)}) THEN CAST({field_identifier} AS VARCHAR) ELSE 'Other' END"
            else:
                field_expr = "'Other'"
            chart_agg = conn.execute(f"""
                SELECT
                    strftime(date_trunc('{bucket_size}', make_timestamp(timestamp // 1000)), '%Y-%m-%dT%H:%M:%S') AS time_bucket,
                    {field_expr} AS field_value,
                    COUNT(*) AS count
                FROM ({base_query}) AS sub
                GROUP BY date_trunc('{bucket_size}', make_timestamp(timestamp // 1000)), field_value
                ORDER BY date_trunc('{bucket_size}', make_timestamp(timestamp // 1000)), count DESC
            """).fetchdf()
            chart_data = {
                'bucketSize': bucket_size,
                'selectedField': selected_field,
                'data': chart_agg.to_dict('records'),
            }
        else:
            chart_agg = conn.execute(f"""
                SELECT
                    strftime(date_trunc('{bucket_size}', make_timestamp(timestamp // 1000)), '%Y-%m-%dT%H:%M:%S') AS time_bucket,
                    COUNT(*) AS count
                FROM ({base_query}) AS sub
                GROUP BY date_trunc('{bucket_size}', make_timestamp(timestamp // 1000))
                ORDER BY date_trunc('{bucket_size}', make_timestamp(timestamp // 1000))
            """).fetchdf()
            chart_data = {
                'bucketSize': bucket_size,
                'selectedField': None,
                'data': chart_agg.to_dict('records'),
            }

        # Add pagination for table data
        offset = (page - 1) * page_size
        paginated_query = query + f" LIMIT {page_size} OFFSET {offset}"

        logger.info(f"Paginated query: {paginated_query[:200]}... OFFSET {offset}")

        # Execute paginated query for table
        result = conn.execute(paginated_query).fetchdf()

        logger.info(f"Query results: total={total}, chart_buckets={len(chart_agg)}, table_rows={len(result)}")

        # Convert timestamp to readable format for table data only
        if 'timestamp' in result.columns:
            result['timestamp'] = result['timestamp'].apply(format_utc_timestamp)

        conn.close()

        return jsonify({
            'data': result.to_dict('records'),
            'chartData': chart_data,
            'total': total,
            'page': page,
            'pageSize': page_size
        })
    
    except InvalidRequestError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in query_data: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/data/columns', methods=['GET'])
def get_columns():
    """Get column names and unique values for filters"""
    try:
        if not parquet_cache['paths']:
            return jsonify({'error': 'No data loaded. Please select a date range first.'}), 400

        conn = connect()

        parquet_read = build_parquet_read_query()
        start_ns, end_ns = get_cached_range_ns()

        columns = {}
        for col, col_type in get_column_types(conn, parquet_read):
            if col != 'timestamp':  # Exclude timestamp from filters
                columns[col] = {
                    'type': col_type,
                    'values': get_column_values(conn, parquet_read, col, [timestamp_condition(start_ns, end_ns)])
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

@app.route('/api/data/filtered-columns', methods=['POST'])
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
        
        conn = connect()
        
        # Get the parquet read expression for all files
        parquet_read = build_parquet_read_query()
        
        # Get timestamp range from cache for filtering
        start_ns, end_ns = get_cached_range_ns()

        # For each column, we'll calculate available values by applying all OTHER filters
        all_column_types = get_column_types(conn, parquet_read)
        available_columns = [col for col, _ in all_column_types]
        column_types = {col: col_type for col, col_type in all_column_types if col != 'timestamp'}
        build_filter_conditions(available_columns, filters, substring_filters, regex_filters)

        columns = {}

        for target_column in column_types:
            conditions = []
            
            # Always add timestamp filtering
            conditions.append(timestamp_condition(start_ns, end_ns))

            conditions += build_filter_conditions(available_columns, filters, substring_filters, regex_filters, exclude_column=target_column)

            # Get available values for this column
            try:
                columns[target_column] = {
                    'type': column_types[target_column],
                    'values': get_column_values(conn, parquet_read, target_column, conditions)
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
    
    except InvalidRequestError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in get_filtered_columns: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

def get_column_types(conn, parquet_read):
    """
    Get the columns of the loaded events and their types, without reading any rows.

    :param conn: The DuckDB connection.
    :param parquet_read: The read expression for the loaded events.
    :return: List of (column, type) tuples, with types named as pandas names them ('object' for text, 'int64' for
        integers).
    """
    pandas_types = {'VARCHAR': 'object', 'BIGINT': 'int64', 'INTEGER': 'int32', 'DOUBLE': 'float64', 'BOOLEAN': 'bool'}
    return [(row[0], pandas_types.get(row[1], row[1])) for row in conn.execute(f"DESCRIBE SELECT * FROM {parquet_read}").fetchall()]


def get_column_values(conn, parquet_read, column, conditions):
    """
    Get the first distinct values of a column in sorted order, computed by DuckDB so that only the returned values are
    held in Python, however many rows or distinct values there are.

    :param conn: The DuckDB connection.
    :param parquet_read: The read expression for the loaded events.
    :param column: The column to get the values of.
    :param conditions: The SQL conditions the events must match.
    :return: Up to COLUMN_VALUES_LIMIT distinct non-null values in ascending order.
    """
    identifier = quote_identifier(column)
    where = ' AND '.join(conditions + [f'{identifier} IS NOT NULL'])
    rows = conn.execute(f'SELECT DISTINCT {identifier} FROM {parquet_read} WHERE {where} ORDER BY 1 LIMIT {COLUMN_VALUES_LIMIT}').fetchall()
    return [row[0] for row in rows]


# Human-readable column name mappings
COLUMN_NAME_MAPPING = {
    'timestamp': 'Date & Time (UTC)',
    'username': 'User Name',
    'action': 'Event',
    'filename': 'File Path',
    'projectName': 'Project Name',
    'workspaceName': 'Workspace Name',
    'environmentName': 'Environment Name',
    'environmentRevisionNumber': 'Environment Revision Number',
    'hardwareTierId': 'Hardware Tier ID',
    'projectId': 'Project ID',
    'workspaceId': 'Workspace ID',
    'userId': 'User ID',
    'uuid': 'UUID',
    'deduplicationId': 'Deduplication ID'
}

def export_filtered_data(filters, substring_filters, regex_filters, file_format):
    """
    Export all filtered events (not paginated) to a file for download. The export is written by DuckDB straight to
    disk, so the events are never loaded into memory however many there are. Columns are ordered and labeled as in the
    UI table, without the hidden columns, and timestamps are formatted as ISO 8601 UTC date-times.

    :param filters: Exact match filters.
    :param substring_filters: Substring filters.
    :param regex_filters: Regex filters.
    :param file_format: 'csv' or 'parquet'.
    :return: Tuple of (path, directory) of the exported file; the caller must remove the directory once sent.
    """
    if not parquet_cache['paths']:
        raise ValueError('No data loaded. Please select a date range first.')

    conn = connect()

    # Get the parquet read expression for all files
    parquet_read = build_parquet_read_query()

    # Get timestamp range from cache for filtering
    start_ns, end_ns = get_cached_range_ns()

    # Build the filter conditions (similar to query_data but without pagination)
    conditions = []

    # Always add timestamp filtering
    conditions.append(timestamp_condition(start_ns, end_ns))

    try:
        conditions += build_filter_conditions([col for col, _ in get_column_types(conn, parquet_read)], filters, substring_filters, regex_filters)
    except Exception:
        conn.close()
        raise

    # Define columns to hide (matching UI hiddenTableColumns)
    HIDDEN_COLUMNS = ['userId', 'uuid', 'deduplicationId']

    # Define UI table column order (matching UI tableColumnOrder)
    TABLE_COLUMN_ORDER = [
        'timestamp',
        'username',
        'action',
        'filename',
        'projectName',
        'projectId',
        'workspaceName',
        'workspaceId',
        'environmentName',
        'environmentRevisionNumber',
        'hardwareTierId',
    ]

    available_columns = [col for col, _ in get_column_types(conn, parquet_read) if col not in HIDDEN_COLUMNS]
    ordered_columns = [col for col in TABLE_COLUMN_ORDER if col in available_columns]
    remaining_columns = [col for col in available_columns if col not in TABLE_COLUMN_ORDER]

    timestamp_expression = (
        "CASE WHEN (timestamp // 1000) % 1000000 = 0 "
        "THEN strftime(make_timestamp(timestamp // 1000), '%Y-%m-%dT%H:%M:%S') "
        "ELSE strftime(make_timestamp(timestamp // 1000), '%Y-%m-%dT%H:%M:%S.%f') END"
    )
    select_list = []
    for col in ordered_columns + remaining_columns:
        expression = timestamp_expression if col == 'timestamp' else quote_identifier(col)
        select_list.append(f'{expression} AS {quote_identifier(COLUMN_NAME_MAPPING.get(col, col))}')

    query = f"SELECT {', '.join(select_list)} FROM {parquet_read} WHERE {' AND '.join(conditions)}"

    export_parent = os.path.join(tempfile.gettempdir(), "workspace_audit_events")
    os.makedirs(export_parent, exist_ok=True)
    export_dir = tempfile.mkdtemp(prefix="export-", dir=export_parent)
    path = os.path.join(export_dir, f"export.{file_format}")
    copy_options = "FORMAT 'csv', HEADER" if file_format == 'csv' else "FORMAT 'parquet'"
    try:
        conn.execute(f"COPY ({query}) TO {sql_string(path)} ({copy_options})")
    except Exception:
        shutil.rmtree(export_dir, ignore_errors=True)
        raise
    finally:
        conn.close()

    return path, export_dir


def send_export(filters, substring_filters, regex_filters, file_format, mimetype):
    """
    Export the filtered events and send them as a file download. The exported file is removed from the directory as
    soon as it is opened, and its space is released once the response has been streamed and the file closed.

    :param filters: Exact match filters.
    :param substring_filters: Substring filters.
    :param regex_filters: Regex filters.
    :param file_format: 'csv' or 'parquet'.
    :param mimetype: The MIME type of the response.
    :return: The Flask response streaming the file.
    """
    path, export_dir = export_filtered_data(filters, substring_filters, regex_filters, file_format)
    try:
        exported = open(path, 'rb')
    finally:
        shutil.rmtree(export_dir, ignore_errors=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return send_file(exported, mimetype=mimetype, as_attachment=True, download_name=f'workspace_audit_events_{timestamp}.{file_format}')

@app.route('/api/download/csv', methods=['POST'])
def download_csv():
    """Download filtered data as CSV"""
    try:
        data = request.get_json()
        return send_export(data.get('filters', {}), data.get('substringFilters', {}), data.get('regexFilters', {}), 'csv', 'text/csv')

    except InvalidRequestError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in download_csv: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

@app.route('/api/download/parquet', methods=['POST'])
def download_parquet():
    """Download filtered data as Parquet"""
    try:
        data = request.get_json()
        return send_export(data.get('filters', {}), data.get('substringFilters', {}), data.get('regexFilters', {}), 'parquet', 'application/octet-stream')

    except InvalidRequestError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error in download_parquet: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500

if __name__ == '__main__':
    
    
    app.run(debug=True, port=5000)