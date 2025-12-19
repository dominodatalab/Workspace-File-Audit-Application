// ============================================================================
// SYNC BUTTON COMPONENT
// ============================================================================

import { state } from "../state.js";
import { loadSyncStatus, syncData } from "../services/api.js";

export function renderSyncButton() {
  const { Button, Tooltip } = antd;
  const container = document.getElementById("sync-button-container");

  const isInProgress = state.lastSyncStatus === "InProgress";
  const tooltipTitle = isInProgress ? "Data refresh is in progress." : "";

  const button = React.createElement(
    Button,
    {
      key: "sync",
      type: "primary",
      disabled: isInProgress,
      onClick: () => {
        syncData();
      },
    },
    "Refresh Data"
  );

  const buttonComponent = isInProgress
    ? React.createElement(Tooltip, { title: tooltipTitle }, button)
    : button;

  ReactDOM.render(buttonComponent, container);
}

export function renderSyncData() {
  if (!state.lastSyncTime || !state.lastSyncStatus) {
    return;
  }

  const lastSyncTime = document.getElementById("last-sync-time");
  const date = new Date(state.lastSyncTime);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const formattedDateTime = `${formattedDate} - ${formattedTime}`;

  ReactDOM.render(
    React.createElement(
      antd.Tooltip,
      {
        title:
          "This reflects the most recent ingestion of workspace audit data.",
      },
      React.createElement(
        "span",
        {
          style: {
            display: "block",
            fontSize: "12px",
            marginBottom: "4px",
            marginLeft: "4px",
            cursor: "help",
          },
        },
        formattedDateTime
      )
    ),
    lastSyncTime
  );

  const lastSyncStatus = document.getElementById("last-sync-status");

  ReactDOM.render(
    React.createElement(
      "span",
      {
        style: {
          display: "block",
          fontSize: "12px",
          marginBottom: "4px",
          marginLeft: "4px",
        },
      },
      state.lastSyncStatus.replace(/([A-Z])/g, " $1").trim()
    ),
    lastSyncStatus
  );
}
