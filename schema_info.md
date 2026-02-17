## Summary of the Workspace Audit Events:
File Location: The parquet file is saved to /var/folders/fc/pwc5x_7n5f75kc95twk5p9980000gp/T/workspace_audit_events/events_0.parquet and will be reused on subsequent runs.
Dataset Statistics:
Total rows: 3 events
Total columns: 12 fields
Memory usage: 0.00 MB
## Schema (12 columns):
uuid - Unique identifier for the event

deduplicationId - Deduplication key combining action, filepath, user, and PID

timestamp - Event timestamp in nanoseconds

filename - Full path to the file being accessed

projectId - Domino project ID

projectName - Name of the project (e.g., "quick-start")

userId - User ID

username - Username (e.g., "integration-test")

hardwareTierId - Hardware tier used (e.g., "small-k8s")

environmentName - Domino environment name

workspaceName - Name of the workspace (e.g., "Test")

action - Type of action performed (Read/Write)

# Sample event:

{
  "uuid": "2a916024-14ba-4f60-8b37-b20bb25de3b1",
  "deduplicationId": "Write-/domino/datasets/local/quick-start/dominostats.json-690e614ca51a3ff1b0b8af39-489684",
  "timestamp": 1762865834062068277,
  "filename": "/domino/datasets/local/quick-start/dominostats.json",
  "projectId": "690e75fc2f6ef11df395ac2c",
  "projectName": "quick-start",
  "userId": "690e614ca51a3ff1b0b8af39",
  "username": "integration-test",
  "hardwareTierId": "small-k8s",
  "environmentName": "DominoStandardEnvironmentPy3.10R4.5",
  "workspaceName": "Test",
  "action": "Write"
}
