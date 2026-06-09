---
name: github-email-extractor
description: >-
  Extracts developer names, emails, and commit dates from a public GitHub repository using commit history metadata.
---

# GitHub Developer Email Extractor

## Overview
This skill allows agents to extract public developer contact information (name, email, and last commit timestamp) from a public GitHub repository. It does this by fetching the latest commit logs via the GitHub API and parsing the commit author metadata.

## Dependencies
This skill operates entirely using standard Python libraries. It utilizes a local script helper at `scripts/extractor.py`.

## Quick Start
Run the extraction script using `python` (or `uv run python`) by passing the repository owner, name, and an output path for the JSON results.

```bash
python .agents/skills/github-email-extractor/scripts/extractor.py --owner gokadzev --repo Musify --output scratch/extracted_emails.json
```

## Utility Scripts

### scripts/extractor.py
The CLI companion script supports the following arguments:

- `--owner` (Required): The organization or username of the repository owner on GitHub.
- `--repo` (Required): The name of the repository.
- `--output` (Required): The path to the file where the JSON output should be saved.

Example execution:
```bash
python .agents/skills/github-email-extractor/scripts/extractor.py --owner Ajpop3y --repo Playlist-Haven --output scratch/playlist_haven_emails.json
```

Output format (saved to the specified JSON file):
```json
[
  {
    "name": "Valeri Gokadze",
    "email": "gokadze.v1@gmail.com",
    "last_commit_date": "2026-06-05T14:07:38Z"
  }
]
```

## Rate Limiting
The script queries the unauthenticated GitHub API, which has a default limit of 60 requests per hour. The script enforces a polite 1.0 second delay before the request, automatically parses `X-RateLimit-Reset` headers in the event of an HTTP 403 or 429 block, and displays the exact wait time before retrying.

## Common Mistakes
1. **Repository is Private:** The script currently accesses the public GitHub commits endpoint. Trying to query a private repository will result in a `404 Not Found` response.
2. **Missing Output argument:** Always remember to specify the `--output` file path. The CLI script strictly requires this argument to avoid spilling large arrays to stdout.
