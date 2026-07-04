# JmZOps

**A status-page, incident-communication, and asset-uptime monitoring system, in the style of status.io and Atlassian Statuspage.**
Built with Node.js, Express.js, MySQL, and vanilla JavaScript.

---

## Table of Contents

1. [Overview](#overview)
2. [Why This Project](#why-this-project)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Database Schema](#database-schema)
6. [Project Structure](#project-structure)
7. [Setup & Installation](#setup--installation)
8. [Running the Application](#running-the-application)
9. [API Endpoints](#api-endpoints)
10. [Features](#features)
11. [Comparable Products](#comparable-products)
12. [Deployment (CI/CD)](#deployment-cicd)

---

## Overview

JmZOps lets a company publish the live operational status of its services to the public, while giving staff an authenticated admin panel to manage components, declare incidents, post timestamped updates, schedule maintenance windows, track internal assets with automatic uptime monitoring, and manage email subscribers.

It mirrors the core feature set of commercial status-page products such as **status.io**, **Atlassian Statuspage**, and **Better Uptime**: a public status page, an incident timeline, scheduled maintenance, subscriber notifications, and per-asset uptime tracking. Staff access is role-based (`super_admin`, `editor`, `viewer`) and secured with JWT-based authentication; the public status page and uptime feed require no login at all.

The frontend is a single-page vanilla-JS app that talks to the Express API exclusively through `fetch()` calls — it never queries MySQL directly.

---

## Why This Project

Status pages are used everywhere in the SaaS industry — every major cloud provider, API, and SaaS tool has its own status dashboard (e.g. Amazon, GitHub, Stripe, Cloudflare). They are a good example of a CRUD-heavy, API-driven information system: incidents, components and assets are created, read, updated and deleted constantly, and the public-facing view must stay perfectly in sync with admin actions on the backend, while still keeping destructive/administrative actions behind authentication.

### Data Requirements

| Entity            | Description                                                            |
|--------------------|------------------------------------------------------------------------|
| Components         | The services shown on the public status page (e.g. API, Website, DB)   |
| Incidents          | Outages/degradations affecting one or more components                 |
| Incident Updates   | Timestamped timeline entries on an incident (investigating → resolved) |
| Maintenance        | Scheduled maintenance windows affecting one or more components         |
| Subscribers        | Email addresses subscribed to status notifications                    |
| Notifications      | Log of every simulated notification sent to subscribers                |
| Staff              | Admin-panel user accounts, each with a role                            |
| Assets             | Internal servers/apps/databases/domains tracked for uptime             |
| Uptime Checks      | Automatic (pinged) or manual (staff-logged) up/down records per asset  |

---

## Tech Stack

| Layer              | Technology                  | Purpose                                          |
|--------------------|------------------------------|---------------------------------------------------|
| Backend runtime    | Node.js v20+                 | JavaScript server-side runtime                    |
| Web framework      | Express.js v4                 | REST API routing                                  |
| Database           | MySQL 8+                      | Relational data storage                           |
| DB library         | mysql2/promise                | MySQL driver with connection pooling              |
| Auth               | jsonwebtoken, bcryptjs        | Staff login tokens and password hashing           |
| Environment config | dotenv                        | Load credentials from a `.env` file               |
| Notifications      | nodemailer                    | Simulated/real subscriber email notifications     |
| CORS               | cors                          | Allow the frontend to call the API                |
| Frontend           | Vanilla HTML5 + CSS + JS       | No framework — `fetch()` API calls                |
| Testing tooling    | Jest, Supertest (dev only)     | Configured via `npm test`; no test suite written yet |

---

## Architecture

```
Browser (public status page + admin panel — same SPA, different views)
      |
      |  fetch() — JSON over HTTP, no page reloads
      v
Express REST API  (Node.js — default port 5050 locally, PORT=3000 in the container)
      |
      |--- /api/public        (no auth)      ──┐
      |--- /api/auth          (login/me)        |
      |--- /api/staff         (super_admin)      |
      |--- /api/assets        (staff, JWT)         ├── MySQL Database
      |--- /api/components    (staff, JWT)          |    components, incidents,
      |--- /api/incidents     (staff, JWT)          |    incident_updates, maintenance,
      |--- /api/maintenance   (staff, JWT)          |    subscribers, notifications,
      |--- /api/subscribers   (staff, JWT)          |    staff, assets, uptime_checks
      |--- /api/notifications (staff, JWT)         |
      |--- /api/dashboard     (staff, JWT)      ──┘
      |
      +--- background monitor (backend/monitor.js): pings every asset with
           a ping_url on an interval and logs the result to uptime_checks
```

Every route except `/api/public/*` and `/api/auth/login` requires a valid `Authorization: Bearer <JWT>` header, issued by `POST /api/auth/login` and verified by `backend/auth.js`'s `authRequired` middleware; `requireRole(...)` further restricts some routes (e.g. staff management) to `super_admin`. The frontend never queries MySQL directly — every read and write goes through the REST API.

---

## Database Schema

### components
| Column        | Type                                                                          | Notes              |
|----------------|--------------------------------------------------------------------------------|---------------------|
| id             | INT AUTO_INCREMENT PK                                                          |                    |
| name           | VARCHAR(120)                                                                    | Required           |
| description    | VARCHAR(255)                                                                    |                    |
| group_name     | VARCHAR(120)                                                                    | Default: General   |
| status         | ENUM('operational','degraded','partial_outage','major_outage','maintenance')   | Default: operational|
| display_order  | INT                                                                             | Default: 0          |
| created_at     | DATETIME                                                                        | Auto-set            |

### incidents
| Column      | Type                                                            | Notes              |
|-------------|-------------------------------------------------------------------|---------------------|
| id          | INT AUTO_INCREMENT PK                                            |                    |
| title       | VARCHAR(255)                                                      | Required            |
| impact      | ENUM('minor','major','critical')                                 | Default: minor       |
| status      | ENUM('investigating','identified','monitoring','resolved')       | Default: investigating |
| created_at  | DATETIME                                                          | Auto-set             |
| resolved_at | DATETIME                                                          | Set when status=resolved |

### incident_updates
| Column      | Type                  | Notes                          |
|-------------|------------------------|---------------------------------|
| id          | INT AUTO_INCREMENT PK |                                 |
| incident_id | INT FK → incidents(id) | ON DELETE CASCADE               |
| status      | ENUM (same as incidents.status) |                        |
| message     | TEXT                  | Required                        |
| created_at  | DATETIME              | Auto-set                        |

### incident_components (junction table)
| Column        | Type                    | Notes                |
|----------------|--------------------------|------------------------|
| incident_id    | INT FK → incidents(id)  | ON DELETE CASCADE, composite PK |
| component_id   | INT FK → components(id) | ON DELETE CASCADE, composite PK |

### maintenance
| Column           | Type                                                       | Notes               |
|-------------------|--------------------------------------------------------------|-----------------------|
| id                | INT AUTO_INCREMENT PK                                        |                      |
| title             | VARCHAR(255)                                                  | Required             |
| description       | TEXT                                                          |                      |
| scheduled_start   | DATETIME                                                      | Required              |
| scheduled_end     | DATETIME                                                      | Required              |
| status            | ENUM('scheduled','in_progress','completed','cancelled')       | Default: scheduled   |
| created_at        | DATETIME                                                      | Auto-set              |

### maintenance_components (junction table)
| Column         | Type                       | Notes                         |
|------------------|-----------------------------|---------------------------------|
| maintenance_id   | INT FK → maintenance(id)   | ON DELETE CASCADE, composite PK |
| component_id     | INT FK → components(id)    | ON DELETE CASCADE, composite PK |

### subscribers
| Column     | Type                 | Notes               |
|------------|------------------------|-----------------------|
| id         | INT AUTO_INCREMENT PK |                       |
| email      | VARCHAR(180) UNIQUE    | Required              |
| created_at | DATETIME               | Auto-set              |

### notifications
| Column          | Type                       | Notes                          |
|------------------|------------------------------|----------------------------------|
| id               | INT AUTO_INCREMENT PK       |                                 |
| subscriber_id    | INT FK → subscribers(id)    | ON DELETE CASCADE                |
| incident_id      | INT FK → incidents(id)      | Nullable, ON DELETE CASCADE      |
| maintenance_id   | INT FK → maintenance(id)    | Nullable, ON DELETE CASCADE      |
| message          | TEXT                        | Required                        |
| sent_at          | DATETIME                    | Auto-set                        |

### staff
| Column        | Type                                          | Notes                     |
|----------------|------------------------------------------------|-----------------------------|
| id             | INT AUTO_INCREMENT PK                          |                            |
| name           | VARCHAR(120)                                    | Required                   |
| email          | VARCHAR(180) UNIQUE                             | Required, login identifier |
| password_hash  | VARCHAR(255)                                    | bcrypt hash                |
| role           | ENUM('super_admin','editor','viewer')           | Default: viewer            |
| created_at     | DATETIME                                        | Auto-set                   |

### assets
| Column                  | Type                                                        | Notes                 |
|--------------------------|--------------------------------------------------------------|------------------------|
| id                       | INT AUTO_INCREMENT PK                                        |                        |
| name                     | VARCHAR(150)                                                  | Required               |
| description              | VARCHAR(255)                                                  |                        |
| type                     | ENUM('server','web_app','database','domain','other')          | Default: other         |
| ping_url                 | VARCHAR(500)                                                   | Nullable — enables auto-monitoring |
| check_interval_seconds   | INT                                                             | Default: 300           |
| status                   | ENUM('up','down','unknown')                                    | Default: unknown       |
| created_at               | DATETIME                                                        | Auto-set               |

### uptime_checks
| Column            | Type                             | Notes                          |
|--------------------|------------------------------------|----------------------------------|
| id                 | INT AUTO_INCREMENT PK              |                                 |
| asset_id           | INT FK → assets(id)                | ON DELETE CASCADE               |
| status             | ENUM('up','down')                  | Required                        |
| response_time_ms   | INT                                 | Nullable                        |
| source             | ENUM('auto','manual')              | Default: manual                 |
| checked_at         | DATETIME                            | Auto-set                        |

---

## Project Structure

```
JmZOps/
├── backend/
│   ├── server.js              # createApp() factory — registers routes, serves frontend
│   ├── db.js                  # MySQL connection pool + schema init + default-admin seed
│   ├── config.js              # DB credentials, JWT secret, default admin — from env vars
│   ├── auth.js                # Password hashing, JWT signing/verification, role middleware
│   ├── monitor.js             # Background interval that pings assets and logs uptime
│   ├── uptime.js               # Shared helper computing 24h/7d/30d/90d uptime percentages
│   ├── notify.js               # Simulated subscriber notification helper
│   └── routes/
│       ├── public.js          # Public status feed + public uptime feed (no auth)
│       ├── auth.js            # Staff login + token verification
│       ├── staff.js           # Staff account management (super_admin only)
│       ├── assets.js          # Asset CRUD + manual/automatic uptime checks
│       ├── components.js      # Component CRUD
│       ├── incidents.js       # Incident CRUD + nested incident-updates timeline
│       ├── maintenance.js     # Maintenance window CRUD
│       ├── subscribers.js     # Subscribe/unsubscribe
│       ├── notifications.js   # Notification log (staff, read-only)
│       └── dashboard.js       # Admin aggregate statistics
├── frontend/
│   ├── index.html             # Single-page UI — public status page + admin panel
│   ├── app.js                 # All fetch() calls and DOM rendering
│   └── style.css              # Styling for both the public and admin views
├── package.json
├── package-lock.json
├── Dockerfile                 # node:22-alpine, non-root user, PORT=3000
├── .dockerignore
├── .gitignore
└── README.md
```

---

## Setup & Installation

1. Install dependencies: `npm install`
2. Create a `.env` file in the project root with at least:
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=
   JWT_SECRET=change-me
   ADMIN_NAME=Default Admin
   ADMIN_EMAIL=
   ADMIN_PASSWORD=
   ```
   Every value has a fallback default in `backend/config.js`, so a `.env` file is only strictly required to point at a non-local MySQL instance or to set a real `JWT_SECRET` and admin password.
3. Ensure a MySQL 8+ server is reachable with the credentials above. `backend/db.js` creates the database and all tables automatically on first run, and seeds one `super_admin` staff account from the `ADMIN_*` variables if the `staff` table is empty.

## Running the Application

- Development, with auto-restart: `npm run dev`
- Production-style start: `npm start`
- The app listens on `process.env.PORT` if set, otherwise `5050`; the Dockerfile sets `PORT=3000` for containerised runs (see [Deployment](#deployment-cicd)).
- Log in to the admin panel with the seeded default admin credentials, then create additional staff accounts via `/api/staff` (super_admin only) rather than continuing to use the default account.

## API Endpoints

| Base path              | Auth              | Purpose                                             |
|-------------------------|-------------------|------------------------------------------------------|
| `/api/public`           | None              | Public status feed (`/status`) and uptime feed (`/uptime`) |
| `/api/auth`             | None / Bearer     | `/login`, and `/me` to re-validate a stored token     |
| `/api/staff`            | Bearer, super_admin | Staff account CRUD                                   |
| `/api/assets`           | Bearer            | Asset CRUD + manual/automatic uptime checks           |
| `/api/components`       | Bearer            | Component CRUD                                        |
| `/api/incidents`        | Bearer            | Incident CRUD + nested incident-updates timeline       |
| `/api/maintenance`      | Bearer            | Maintenance window CRUD                                |
| `/api/subscribers`      | Bearer            | Subscribe/unsubscribe management                       |
| `/api/notifications`    | Bearer            | Read-only notification log                             |
| `/api/dashboard`        | Bearer            | Aggregate admin statistics                             |

Routes marked `editor`/`super_admin` in the code additionally restrict write operations to those roles even once authenticated; `viewer` accounts can read but not modify.

## Features

- Public status page with an overall system status rolled up from every component's worst state.
- Incident management with a timestamped update timeline per incident.
- Scheduled maintenance windows linked to affected components.
- Email subscriber list with a simulated notification log.
- Role-based staff accounts (`super_admin`, `editor`, `viewer`) secured with JWT authentication and bcrypt password hashing.
- Internal asset tracking with both automatic (interval-pinged) and manual uptime checks, and rolling 24h/7d/30d/90d uptime percentages exposed on both the admin and public views.

## Comparable Products

JmZOps' feature set overlaps with **status.io**, **Atlassian Statuspage**, and **Better Uptime** — each combines a public incident/status page with backend monitoring and subscriber notifications, which is the same shape this project follows at a smaller scale.

---

## Deployment (CI/CD)

`.github/workflows/deploy.yml` builds a Docker image of this app, scans it with [Trivy](https://github.com/aquasecurity/trivy), pushes it to Google Artifact Registry, and deploys it to the app VM provisioned by the sibling `networking-project-infra-setup` repository's Terraform/Ansible, on every push to `main`.

```
push to main
    │
    ▼
build-scan-push job
    │  checkout + gcloud auth
    │  docker build -t <image>:$GITHUB_SHA
    │  trivy scan (SARIF report → GitHub Security tab; a separate table-format
    │              scan blocks the pipeline on any fixable CRITICAL vulnerability)
    │  docker push → <region>-docker.pkg.dev/<project>/networking-app/jmzops
    ▼
deploy job  (needs: build-scan-push, environment: production)
    │  recompute the same image reference from GCP_PROJECT_ID + $GITHUB_SHA
    │  configure an SSH key, then `docker context create` pointing the local
    │  docker CLI at the app VM's daemon over SSH — no scp, no bespoke
    │  deploy script, no manual access-token/docker login dance
    │  write a client-side .env file with DB + JWT secrets
    │  docker pull / stop / rm / run (port 5000 → container :3000)
    │  remove the docker context; curl the app VM to smoke-test the deploy
    ▼
running at http://<app VM public IP>:5000/ (proxied to :80 by nginx,
configured by the infra repo's Ansible playbook)
```

Container Registry (`gcr.io`) has been fully shut down for writes since March 2025, so this pushes to Artifact Registry instead — the infra repo's Terraform (`artifact-registry.tf`) provisions the `networking-app` Docker repository the workflow pushes to.

Nothing here deploys via Ansible or re-runs Terraform: this repo only talks to the already-provisioned app VM over SSH, using `docker` directly (Docker itself was installed and enabled on that VM by the infra repo's Ansible playbook).

### Required repository secrets

| Secret | Purpose |
|---|---|
| `GCP_SA_KEY` | Service account JSON key — authenticates `gcloud`/`docker push`/`docker pull` |
| `GCP_PROJECT_ID` | GCP project ID, used to build the Artifact Registry image path |
| `GCP_SSH_PRIVATE_KEY` | Private key matching the public key injected into the app VM (see infra repo's `SSH_PUBLIC_KEY`) |
| `GCP_VM_HOST` | App VM's public IP (`instance_public_ip` Terraform output from the infra repo) |
| `GCP_VM_USER` | SSH user on the app VM (`ubuntu`) |
| `DB_HOST` | DB VM's **private** IP (`db_instance_private_ip` Terraform output from the infra repo) — the app VM can reach it, your laptop can't |
| `DB_PORT` | `3306` |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Must match the MySQL user/database the infra repo's Ansible playbook created on the DB VM |
| `JWT_SECRET` | Signing secret for this app's auth tokens |

The service account behind `GCP_SA_KEY` needs `roles/artifactregistry.writer` (to push images) in addition to whatever Compute/Terraform permissions it already has for the infra repo.
