// ============================================================================
// SYNC BUTTON COMPONENT
// ============================================================================

import { state } from "../state.js";
import { loadSyncStatus, syncData } from "../services/api.js";

// Render Sync Button using Ant Design
export function renderSyncButton() {
  const { Button } = antd;
  const container = document.getElementById("sync-button-container");
  ReactDOM.render(
    React.createElement(
      Button,
      {
        key: "sync",
        type: "primary",
        onClick: () => {
          syncData();
          renderSyncData();
        },
      },
      "Refresh Data"
    ),
    container
  );
}

// Render last sync data
export function renderSyncData() {
  const lastSyncTime = document.getElementById("last-sync-time")

  const parts = state.lastSyncTime.split('T');
  const datePart = parts[0];
  const timeWithZone = parts[1];
  const timePartUTC = timeWithZone.split('.')[0];

  ReactDOM.render(
  	React.createElement(
  		"span",
  		{ style: { display:"block", fontSize: "12px", marginBottom: "4px", marginLeft: "4px" } },
  		datePart + " " + timePartUTC
  	),
  	lastSyncTime
  )

  const lastSyncStatus = document.getElementById("last-sync-status")



  ReactDOM.render(
  	React.createElement(
  		"span",
  		{ style: { display:"block", fontSize: "12px", marginBottom: "4px", marginLeft: "4px" } },
  		state.lastSyncStatus.replace(/([A-Z])/g, ' $1').trim()
  	),
  	lastSyncStatus
  )
}