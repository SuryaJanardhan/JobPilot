# Daily Job Hunter

Isolated automation module that:

1. Reads domains from your Google Sheet column `A`.
2. Scrapes career/job links aggressively per domain.
3. Keeps only resume-aligned jobs.
4. Stops when it collects `10` unique jobs (or timeout).
5. Updates sheet columns `B:F`.
6. Emails the collected links with one-line notes.

## Run locally

```bash
node daily-job-hunter/index.js
```

## Optional env vars

```env
JOB_SHEET_LINK=https://docs.google.com/spreadsheets/d/.../edit#gid=0
TARGET_JOBS=10
MAX_RUN_MINUTES=120
JOB_HUNTER_DRY_RUN=1
```

`JOB_HUNTER_DRY_RUN=1` skips email sending.
