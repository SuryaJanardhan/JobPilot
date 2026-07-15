# JobPilot

## GetJob Automation Suite

This repository automates your job outreach in four parts:

1. Email campaign from Google Sheets contacts.
2. Delivery verification (bounce/error tracking).
3. LinkedIn outreach automation.
4. Daily job hunter that finds resume-aligned fresher roles and emails links.

The goal is simple: save manual effort and keep your applications moving every day.

## What This Project Does

### 1) Email Campaign (`email-automation/src/index.js`)
- Reads unsent contacts from Google Sheets.
- Scrapes the recruiter's company homepage in parallel to gather context.
- Generates personalized cold-email bodies in batches of 10 using Groq AI (`llama-3.3-70b-versatile`) to reference company context.
- Automatically falls back to a witty, tech-themed template if scraping fails or the Groq key is missing.
- Sends emails via Gmail SMTP, updates Google Sheets, and mails a daily run summary report tracking scraping success rates.

### 2) Delivery Verification (`email-automation/scripts/phase5.js`)
- Checks sent emails and bounce notifications using IMAP.
- Detects failed deliveries.
- Writes failure reasons back to Google Sheets.
- Sends a summary report email.

### 3) LinkedIn Outreach (`linkedin-automation/linkedin_outreach.py`)
- Uses LinkedIn cookie auth.
- Sends connection messages with controlled limits.
- Tracks status in Excel.

### 4) Daily Job Hunter (`web-job-hunter/index.js`)
- Reads company domains from your target sheet.
- Runs a single-pass scrape loop over each domain to prevent infinite loops.
- Scrapes careers/job pages and gathers candidates.
- **Batch LLM Alignment**: Pre-filters listings and calls the Groq LLM in a single batch to verify if jobs align with your resume skills (Full Stack, Node, React, Python, AI/ML, APIs), fresher suitability (0-2 years), and India eligibility (hybrid/remote).
- Falls back to keyword heuristics if the LLM key is missing.
- Batch updates Google Sheets at the end of the run to preserve Sheets write quotas.
- Emails you the aligned job links (internship/FTE) with one-line summaries.

## Project Structure

```text
email-automation/
  index.js                      # Main email campaign orchestrator

  email-automation/scripts/
    phase1.js                   # Load unsent rows from Sheets
    phase2.js                   # Batch preparation
    phase3.js                   # Send batch emails
    phase4.js                   # Update sent status in Sheets
    phase5.js                   # Bounce/error verification
    llm.js                      # Groq subject/body variation

web-job-hunter/
  index.js                      # Daily fresher job scraping + mail
  README.md

linkedin-automation/
  linkedin_outreach.py          # LinkedIn automation
  linkedin-data.xlsx

.github/workflows/
  daily-email.yml
  verify-delivery.yml
  linkedin-automation.yml
  daily-job-hunter.yml
```

## Prerequisites

- Node.js 18+
- npm
- Gmail account with App Password enabled
- Google Cloud service account JSON with Google Sheets access
- (For LinkedIn flow) Python 3.10+ and required packages

## Environment Setup

Create `.env` in the relevant app folder:

```env
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
GROQ_API_KEY=your_groq_key
```

Optional variables for daily job hunter:

```env
JOB_SHEET_LINK=https://docs.google.com/spreadsheets/d/.../edit?gid=0#gid=0
TARGET_JOBS=10
MAX_RUN_MINUTES=120
JOB_HUNTER_DRY_RUN=0
JOB_HUNTER_MAX_PAGES=40      # Max pages to crawl per domain (default 40, set lower e.g. 2 for test runs)
JOB_FETCH_RETRIES=3          # HTTP fetch attempt limit (default 3)
JOB_FETCH_DELAY_MS=450       # Delay between successive requests to prevent rate blocks
```

Place the Google service account JSON where each app expects it:

```text
email-automation/seismic-rarity-468405-j1-cd12fe29c298.json
seismic-rarity-468405-j1-cd12fe29c298.json
```

Share the Google Sheet(s) with the service account email.

## Install

```bash
cd email-automation && npm ci
cd ../web-job-hunter && npm install
```

## Local Usage

### Run email campaign

```bash
cd email-automation && npm start
```

This flow uses AI to generate multiple cold-email subject lines and body variants before sending.

### Verify delivery status

```bash
cd email-automation && npm run verify
```

### Run daily job hunter manually

```bash
node web-job-hunter/index.js
```

### Run LinkedIn outreach manually

```bash
cd linkedin-automation
pip install selenium pandas openpyxl
python linkedin_outreach.py --cookie "YOUR_LI_AT_COOKIE" --limit 5
```

## GitHub Actions Schedules

- `daily-email.yml`: daily email campaign.
- `verify-delivery.yml`: bounce verification after email run.
- `linkedin-automation.yml`: LinkedIn outreach automation.
- `daily-job-hunter.yml`: runs daily at 5:00 AM IST (`30 23 * * *` UTC cron).

All workflows also support manual trigger (`workflow_dispatch`).

## Required GitHub Secrets

- `EMAIL_USER`
- `EMAIL_PASS`
- `GROQ_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `LINKEDIN_COOKIE` (for LinkedIn workflow)

## Notes

- This repo is optimized for your personal outreach process.
- Keep sending volume within safe limits to reduce spam/rate-limit risk.
- For testing job hunter without sending email, set `JOB_HUNTER_DRY_RUN=1`.

