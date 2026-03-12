# Testing Scheduled Calls

This guide shows how to use the developer endpoints for managing scheduled calls.

## Prerequisites

1. Get your JWT token from the mobile app or by logging in
2. Get a group ID from your groups

## API Endpoints

### 1. Get All Scheduled Calls

```bash
curl -X GET http://localhost:4000/groups/{groupId}/calls/{groupId}/scheduled \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. Create a Scheduled Call

```bash
# Schedule a call for 5 minutes from now
curl -X POST http://localhost:4000/groups/{groupId}/calls/{groupId}/scheduled \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduled_at": "'$(date -u -v+5M +"%Y-%m-%dT%H:%M:%S.000Z")'"
  }'

# Or specify a specific time (ISO 8601 format)
curl -X POST http://localhost:4000/groups/{groupId}/calls/{groupId}/scheduled \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduled_at": "2026-03-11T20:00:00.000Z"
  }'
```

### 3. Update a Scheduled Call

```bash
curl -X PATCH http://localhost:4000/groups/{groupId}/calls/{groupId}/scheduled/{callId} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduled_at": "'$(date -u -v+10M +"%Y-%m-%dT%H:%M:%S.000Z")'"
  }'
```

### 4. Delete a Scheduled Call

```bash
curl -X DELETE http://localhost:4000/groups/{groupId}/calls/{groupId}/scheduled/{callId} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Example Workflow

```bash
# 1. Set your JWT token and group ID
export JWT_TOKEN="your_jwt_token_here"
export GROUP_ID="your_group_id_here"

# 2. View existing scheduled calls
curl -X GET http://localhost:4000/groups/$GROUP_ID/calls/$GROUP_ID/scheduled \
  -H "Authorization: Bearer $JWT_TOKEN"

# 3. Create a call scheduled for 2 minutes from now
SCHEDULED_TIME=$(date -u -v+2M +"%Y-%m-%dT%H:%M:%S.000Z")
curl -X POST http://localhost:4000/groups/$GROUP_ID/calls/$GROUP_ID/scheduled \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scheduled_at\": \"$SCHEDULED_TIME\"}"

# 4. Get the call ID from the response and save it
export CALL_ID="call_id_from_response"

# 5. Update the scheduled time to 5 minutes from now
NEW_TIME=$(date -u -v+5M +"%Y-%m-%dT%H:%M:%S.000Z")
curl -X PATCH http://localhost:4000/groups/$GROUP_ID/calls/$GROUP_ID/scheduled/$CALL_ID \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"scheduled_at\": \"$NEW_TIME\"}"

# 6. Delete the scheduled call
curl -X DELETE http://localhost:4000/groups/$GROUP_ID/calls/$GROUP_ID/scheduled/$CALL_ID \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## Notes

- All times must be in ISO 8601 format (e.g., `2026-03-11T20:00:00.000Z`)
- You can only modify/delete calls with status "scheduled" (not active or ended)
- The `ends_at` time is automatically calculated based on the group's `call_duration_minutes`
- Only group members can manage scheduled calls for their groups
