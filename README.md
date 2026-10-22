# jobhunt-app

Personal job search tracker, built to run my own search end-to-end rather than fight a spreadsheet.

## Why

Job hunting is a pipeline problem: dozens of offers, many stages (sourced → to apply → screening → case study → final → offer), signals coming in from Gmail alerts, LinkedIn, recruiter emails and network conversations. Nothing off-the-shelf fit, so I built one.

## What it does

- **Ingests offers** from Gmail job alerts (LinkedIn, Welcome to the Jungle, recruiters), extracts the role, scores it against my profile, and files it as "to validate".
- **Tracks each process** through stages (to_apply → screening → interviews → offer / rejected), with notes per step.
- **Dedupes** by offer URL — the same role surfacing twice doesn't create a duplicate.
- **Updates** itself from Gmail + Calendar: sent applications, positive / negative feedback, scheduled interviews, network meetings.
- **Prepares application packages** (tailored CV + cover letter) in Google Drive from a single command.

## Stack

TypeScript · Next.js · [adjust: Prisma / Postgres / SQLite?] · Gmail, Google Calendar, Google Drive and Notion APIs. A set of Claude skills drive the ingestion and update flows.

## Status

Running in production for one user (me). Not open for contributions, but happy to chat about the design — ping me on [LinkedIn](https://www.linkedin.com/in/antoine-de-fontenay-a0bb038/).

## Security

This repo is scanned with [ggshield](https://github.com/GitGuardian/ggshield) before every push. All secrets (ingestion keys, OAuth tokens) live in environment variables and are never committed.

