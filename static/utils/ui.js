// ============================================================================
// UI UTILITIES
// ============================================================================

// Show/hide loading indicator
export function showLoading(show) {
  const loading = document.getElementById("loading");
  if (show) {
    loading.classList.add("active");
  } else {
    loading.classList.remove("active");
  }
}

// Show error message
export function showError(message) {
  const container = document.getElementById("error-container");
  container.innerHTML = `<div class="error-message">${message}</div>`;
}

// Clear error message
export function clearError() {
  const container = document.getElementById("error-container");
  container.innerHTML = "";
}
