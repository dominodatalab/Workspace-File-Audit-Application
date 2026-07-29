"""
Helper functions for the Workspace Audit application.
"""
import requests
import logging
import traceback

logger = logging.getLogger(__name__)


def safe_api_request(url, headers=None, timeout=30, method='GET', **kwargs):
    """
    Make a safe API request with comprehensive error handling.

    :param url: The URL to request.
    :param headers: Optional HTTP headers to include in the request.
    :param timeout: Request timeout in seconds (default: 30).
    :param method: HTTP method - 'GET' or 'POST' (default: 'GET').
    :param kwargs: Additional arguments to pass to requests.get/post.
    :return: Tuple of (success: bool, data: dict|None, error_msg: str|None, status_code: int)
        - success: True if request succeeded and returned valid JSON, False otherwise
        - data: Parsed JSON response data if successful, None if failed
        - error_msg: Error message string if failed, None if successful
        - status_code: HTTP status code from the response (or error code like 504 for timeout)
    """
    try:
        if method.upper() == 'GET':
            response = requests.get(url, headers=headers, timeout=timeout, **kwargs)
        elif method.upper() == 'POST':
            response = requests.post(url, headers=headers, timeout=timeout, **kwargs)
        else:
            return False, None, f'Unsupported HTTP method: {method}', 400

        if not response.ok:
            error_msg = f'API returned status {response.status_code}'
            logger.error(f'{error_msg} for {url}')
            logger.error(f'Response: {response.text[:500]}')
            return False, None, error_msg, response.status_code

        try:
            data = response.json()
            return True, data, None, response.status_code
        except Exception as json_error:
            logger.error(f'Failed to parse JSON from {url}: {json_error}')
            return False, None, 'Invalid JSON response from API', 502

    except requests.exceptions.Timeout:
        error_msg = f'Request timeout after {timeout}s'
        logger.error(f'{error_msg} for {url}')
        return False, None, error_msg, 504
    except requests.exceptions.ConnectionError as e:
        error_msg = f'Connection error: {str(e)}'
        logger.error(f'{error_msg} for {url}')
        return False, None, error_msg, 503
    except Exception as e:
        error_msg = f'Unexpected error: {str(e)}'
        logger.error(f'{error_msg} for {url}')
        logger.error(traceback.format_exc())
        return False, None, error_msg, 500
