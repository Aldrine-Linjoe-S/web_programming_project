# CampusFix - Campus Maintenance Tracker

CampusFix is a simple React + Vite frontend with an Express API and local JSON persistence.

## Features

- Admin dashboard with request totals, recent activity, and status overview.
- Student dashboard showing only complaints owned by the signed-in student.
- Complaint submission, request search/filtering, assignment, and status updates.
- Admin-only Reports page and CSV export.
- Responsive loading, empty, and error states.

## Configure login accounts

Before starting the API, copy `server/.env.example` to `server/.env` and replace the blank secret values with private credentials. In PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Configure a random `CAMPUSFIX_SESSION_SECRET` of at least 32 characters, an admin username/password (password at least 8 characters), and one or more student accounts in `CAMPUSFIX_STUDENT_ACCOUNTS` as a JSON array. Example:

```text
CAMPUSFIX_SESSION_SECRET=use-a-private-random-value-with-32-or-more-characters
CAMPUSFIX_ADMIN_USERNAME=admin
CAMPUSFIX_ADMIN_PASSWORD=your-private-admin-password
CAMPUSFIX_ADMIN_NAME=Campus Administrator
CAMPUSFIX_STUDENT_ACCOUNTS=[{"username":"student1","password":"your-private-student-password","name":"Student One"}]
```

The backend verifies passwords using Node's scrypt and issues an expiring, signed, HttpOnly session cookie. Passwords are kept as local development secrets in `server/.env` and derived into scrypt hashes at startup. Keep that file private and do not commit it. Accounts are configured by the project owner; there is no public registration page.

## Run locally

Requirements: Node.js 18+ and npm.

### 1. Start the API

```bash
cd server
npm install
npm run dev
```

The API runs at `http://localhost:4000`.

### 2. Start the frontend

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## API access

- `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` handle sessions.
- `GET /api/dashboard` returns all-campus totals to admins and own-request totals to students.
- `GET /api/complaints` returns all complaints to admins and only owned complaints to students.
- `POST /api/complaints` allows signed-in admins and students to submit complaints.
- `PATCH /api/complaints/:id` is admin-only.
- `GET /api/reports` and `GET /api/workers` are admin-only.

Complaint data remains in `server/data/db.json`. This is a simple local college project login, not a complete production identity system; use HTTPS, persistent salted password hashes, secure account provisioning, and login rate limiting before exposing it to a public network.
