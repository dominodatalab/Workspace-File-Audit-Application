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
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  container.innerHTML = "";
  container.appendChild(errorDiv);
}

// Clear error message
export function clearError() {
  const container = document.getElementById("error-container");
  container.innerHTML = "";
}
