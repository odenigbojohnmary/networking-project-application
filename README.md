# JmZOps

**A public status-page / incident-communication system, in the style of status.io and Atlassian Statuspage.**
Built with Node.js, Express.js, MySQL, and Vanilla JavaScript.

---

## Table of Contents

1. [Overview](#overview)
2. [Why This Project](#why-this-project)
3. [System Requirements](#system-requirements)
4. [Tech Stack](#tech-stack)
5. [Architecture](#architecture)
6. [Database Schema](#database-schema)
7. [Project Structure](#project-structure)
8. [Setup & Installation](#setup--installation)
9. [Running the Application](#running-the-application)
10. [API Endpoints](#api-endpoints)
11. [Features](#features)
12. [Running Tests](#running-tests)
13. [Comparable Products](#comparable-products)
14. [Attributions](#attributions)

---

## Overview

JmZOps lets a company publish the live operational status of its services to the public, while giving the team an admin panel to manage components, declare incidents, post timestamped updates, schedule maintenance windows, and manage email subscribers.

It mirrors the core feature set of commercial status-page products such as **status.io**, **Atlassian Statuspage**, and **Better Uptime**: a public status page, an incident timeline, scheduled maintenance, and subscriber notifications.

This is the JavaScript/Express project and the frontend communicate through fetch() calls.
---

## Why This Project

Status pages are used everywhere in most SaaS industry — every major cloud provider, API, and SaaS tool has their own status page dashboard (eg: Amazon, GitHub, Stripe,Cloudflare, etc.). They are an example of a CRUD-heavy and API-driven information system: incidents and components are created/read/updated/deleted constantly, and the public-facing view must be perfectly in sync with the admin actions at the backend.

---

### Data Requirements

| Entity            | Description                                                          |
|--------------------|------------------------------------------------------------------------|
| Components         | The services shown on the status page (e.g. API, Website, Database)   |
| Incidents          | Outages/degradations affecting one or more components                |
| Incident Updates   | Timestamped timeline entries on an incident (investigating → resolved)|
| Maintenance        | Scheduled maintenance windows affecting one or more components        |
| Subscribers        | Email addresses subscribed to status notifications                    |
| Notifications       | Log of every simulated notification sent to subscribers              |

---

## Tech Stack

| Layer              | Technology                          | Purpose                              |
|--------------------|--------------------------------------|---------------------------------------|
| Backend runtime    | Node.js v20+                         | JavaScript server-side runtime        |
| Web framework      | Express.js v4                        | REST API routing                      |
| Database           | MySQL 8+                             | Relational data storage               |
| DB library         | mysql/promise                        | MySQL driver with connection pooling  |
| Environment config | dotenv                               | Load credentials from `.env` file     |
| CORS               | cors                                 | Allow frontend to call the API        |
| Frontend           | Vanilla HTML5 + JavaScript           | No framework — `fetch()` API calls    |

---

## Architecture

```
Browser (public status page + admin panel — same SPA, two tabs)
      |
      |  fetch() — JSON over HTTP, no page reloads
      v
Express REST API  (Node.js — port 5050)
      |
      |--- /api/public/status   ──┐
      |--- /api/components        |
      |--- /api/incidents         ├──  MySQL Database (status_db)
      |--- /api/maintenance       |     tables: components, incidents,
      |--- /api/subscribers       |     incident_updates, incident_components,
      |--- /api/notifications     |     maintenance, maintenance_components,
      |--- /api/dashboard       ──┘     subscribers, notifications
```


The frontend never queries MySQL directly — every read and write goes through the REST API, satisfying the assignment's API-driven architecture requirement.

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

---

## Project Structure

```
JmZOps/
├── backend/
│   ├── server.js              # createApp() factory — registers routes, serves frontend
│   ├── db.js                  # MySQL connection pools (keyed by DB name) + schema init
│   ├── config.js              # DB credentials loaded from environment variables
│   ├── notify.js              # Simulated subscriber notification helper
│   └── routes/
│       ├── components.js      # Component CRUD
│       ├── incidents.js       # Incident CRUD + nested incident-updates timeline
│       ├── maintenance.js     # Maintenance window CRUD
│       ├── subscribers.js     # Subscribe/unsubscribe
│       ├── notifications.js   # Notification log (admin)
│       ├── public.js          # Public status feed
│       └── dashboard.js       # Admin aggregate statistics
├── frontend/
│   ├── index.html             # Single-page UI — public status page + admin panel tabs
│   └── app.js                 # All fetch() calls and DOM rendering (shared with Python version)
├── tests/
│   ├── setup.js               # Jest helper — builds app against test DB + truncates tables
│   ├── crud.test.js           # Unit tests — CRUD across all entities
│   └── integration.test.js    # Integration tests — notifications + public feed + dashboard
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Deployment (CI/CD)

`.github/workflows/deploy.yml` builds a Docker image of this app, scans it
with [Trivy](https://github.com/aquasecurity/trivy), pushes it to Google
Artifact Registry, and deploys it to the app VM provisioned by the sibling
`networking-project-infra-setup` repo's Terraform/Ansible, on every push to
`main`.

```
push to main
    │
    ▼
build-scan-push job
    │  docker build
    │  trivy scan (report → GitHub Security tab; blocks the pipeline on
    │              any fixable CRITICAL vulnerability)
    │  docker push → <region>-docker.pkg.dev/<project>/networking-app/statuswatch
    ▼
deploy job
    │  mint a short-lived Artifact Registry access token via gcloud
    │  scp a container .env file + a deploy script to the app VM
    │  ssh in, docker login / pull / stop+rm old / run new (port 5000→3000)
    │  curl the app VM to smoke-test the deploy
    ▼
running at http://<app VM public IP>:5000/ (proxied to :80 by nginx,
configured by the infra repo's Ansible playbook)
```

Container Registry (`gcr.io`) has been fully shut down for writes since
March 2025, so this pushes to Artifact Registry instead — the infra repo's
Terraform (`artifact-registry.tf`) provisions the `networking-app` Docker
repository the workflow pushes to.

Nothing here deploys via Ansible or re-runs Terraform: this repo only talks
to the already-provisioned app VM over SSH, using `docker` directly (Docker
itself was installed and enabled on that VM by the infra repo's Ansible
playbook).

### Required repository secrets

| Secret | Purpose |
|---|---|
| `GCP_SA_KEY` | Service account JSON key — authenticates `docker push`/`gcloud auth print-access-token` |
| `GCP_PROJECT_ID` | GCP project ID, used to build the Artifact Registry image path |
| `GCP_SSH_PRIVATE_KEY` | Private key matching the public key injected into the app VM (see infra repo's `SSH_PUBLIC_KEY`) |
| `GCP_VM_HOST` | App VM's public IP (`instance_public_ip` Terraform output from the infra repo) |
| `GCP_VM_USER` | SSH user on the app VM (`ubuntu`) |
| `DB_HOST` | DB VM's **private** IP (`db_instance_private_ip` Terraform output from the infra repo) — the app VM can reach it, your laptop can't |
| `DB_PORT` | `3306` |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Must match the MySQL user/database the infra repo's Ansible playbook created on the DB VM |
| `JWT_SECRET` | Signing secret for this app's auth tokens |

The service account behind `GCP_SA_KEY` needs `roles/artifactregistry.writer`
(to push images) in addition to whatever Compute/Terraform permissions it
already has for the infra repo.
