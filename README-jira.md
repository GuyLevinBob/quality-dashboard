# Jira Bug Retrieval Script

This script connects to your Jira instance at `hibob.atlassian.net` and retrieves all bugs.

## Setup

1. **Get your API token** from the Atlassian extension settings you showed me, or create a new one at:
   - https://id.atlassian.com/manage-profile/security/api-tokens

2. **Configure your credentials** in the `.env` file:
   - The `.env` file has been created for you
   - Edit it and replace `your-api-token-here` with your actual API token
   - Update `JIRA_EMAIL` if needed (currently set to `guy.levin@hibob.io`)
   - The `.env` file is already in `.gitignore` so it won't be committed

## Usage

**Test the connection first:**
```bash
node test-jira-connection.js
```

**Then run the full script:**
```bash
node jira-bugs.js
```

The scripts will:
1. Load credentials securely from the `.env` file
2. Test/list all available projects in your Jira instance  
3. Fetch all bugs across all projects
4. Display them in a formatted list with details

## Features

- Fetches bugs with key, summary, status, priority, assignee, reporter, dates
- Shows first 200 characters of description
- Handles Atlassian Document Format (ADF) for descriptions
- Error handling for API calls
- Configurable project filtering

## Customization

To fetch bugs from a specific project only, modify the script to use:
```javascript
const projectBugs = await jira.getBugs('PROJECT-KEY');
```

Replace `'PROJECT-KEY'` with the actual project key from the projects list.