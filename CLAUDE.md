# Good Driver Incentive Program — Claude Code Guide

## Project Overview

A full-stack web application for a trucking industry driver incentive program. Sponsors award
points to drivers for good on-road behavior; drivers redeem points in a sponsor-curated product
catalog (sourced from the iTunes public API). The company earns 1% of total sales.

**Three user roles:** Drivers, Sponsor Users, Admin Users.

---

## Tech Stack

| Layer    | Technology                                              |
|----------|---------------------------------------------------------|
| Frontend | React (built to static files, served by Express in prod)|
| Backend  | Node.js / Express, entry point `backend/src/index.js`  |
| Database | MySQL (AWS RDS)                                        |
| API      | iTunes Search API (product catalog)                    |
| Deploy   | AWS Elastic Beanstalk (single environment — Express serves both API and React static build) |

### Local vs. Production

| Context     | Frontend              | Backend               |
|-------------|-----------------------|-----------------------|
| Development | `localhost:3000` (CRA dev server, proxied) | `localhost:8001` |
| Production  | Served as static build from `backend/public/` by Express | Same process, port 8080 (EB default) |

In production there is **no separate frontend server**. The React app is built (`npm run build`
in `front-end/`) and the output is copied into `backend/public/`. Express serves those files
with `express.static` and falls back to `index.html` for client-side routing.

---

## Repository Structure

```
/
├── front-end/
│   └── src/
│       ├── components/         # Shared/reusable components (DriverProfile.js, SponsorProfile.js, adminDashboard.js, etc.)
│       ├── Catalogue.js        # iTunes-backed product catalog + cart
│       └── App.js
├── backend/
│   └── src/
│       ├── routes/             # Express route handlers (see Route Namespaces below)
│       ├── middleware/         # auth.js, requireActiveSession.js
│       ├── lib/                # itunesLookup.js
│       ├── jobs/               # archiveSponsorsJob.js (background job)
│       ├── db.js               # MySQL connection pool
│       └── index.js            # Express app entry point (was server.js)
├── backend/scripts/            # DB migration scripts (run from backend/scripts/ dir)
│   └── *.js
└── CLAUDE.md                   # This file
```

---

## Route Namespaces

All routes are registered in `backend/src/index.js`:

| Prefix             | File                  | Who uses it          |
|--------------------|-----------------------|----------------------|
| `/auth`            | `routes/auth.js`      | All (login, register, username/email change) |
| `/api/profile`     | `routes/profile.js`   | All (change password) |
| `/api`             | `routes/driver.js`    | Drivers (points, cart, wishlist, sponsors, notifications, friends, feed) |
| `/api/apps`        | `routes/driverApps.js`| Drivers (application management) |
| `/api/catalogue`   | `routes/catalogue.js` | Drivers (legacy points + purchases — being superseded by driver.js) |
| `/api/about`       | `routes/about.js`     | Public |
| `/api` (mfa)       | `routes/mfa.js`       | All (MFA settings) |
| `/sponsor`         | `routes/sponsor.js`   | Sponsor users |
| `/admin`           | `routes/admin.js`     | Admin users |

> **Note:** The catalogue was previously a separate microservice. It has been fully merged into
> the main backend. `routes/catalogue.js` handles legacy purchase/points endpoints;
> new catalog functionality lives in `routes/driver.js`.

---

## Key Database Tables

| Table                    | Purpose                                                        |
|--------------------------|----------------------------------------------------------------|
| `users`                  | All users; `role` = DRIVER/SPONSOR/ADMIN; `active_sponsor_id` (RC2) |
| `drivers`                | Join table: one row per driver–sponsor relationship; `points_balance` per sponsor (RC2) |
| `sponsors`               | Sponsor organizations                                          |
| `driver_applications`    | Pending/approved/rejected driver applications                  |
| `driver_cart`            | Server-persisted cart items per driver                         |
| `driver_preferences`     | Per-driver settings (e.g., `dnd_enabled`)                      |
| `driver_hidden_products` | Products a driver has hidden from their catalogue              |
| `driver_points_history`  | Per-sponsor point change history (RC2); includes `sponsor_id`  |
| `sponsor_hidden_products`| Products a sponsor has hidden from their drivers               |
| `point_transactions`     | Legacy point add/deduct history                                |
| `audit_logs`             | Audit events: logins, password changes, point changes, etc.    |
| `purchases`              | Purchase records (item name, cost, points_after, track URL)    |
| `sessions`               | JWT jti tracking for session revocation                        |
| `notifications`          | In-app driver notifications                                    |
| `sponsor_posts`          | Posts created by sponsors for their drivers                    |
| `sponsor_reviews`        | Driver reviews/ratings of sponsors                             |
| `driver_ratings`         | Sponsor thumbs-up/down ratings of drivers                      |
| `about_info`             | About page data (team #, version, release date)                |

---

## Environment & Running Locally

```bash
# Backend
cd backend
npm install
npm start          # starts on port 8001

# Frontend (dev server only — not used in production)
cd front-end
npm install
npm start          # starts on port 3000, proxies /api /auth /sponsor /admin to :8001

# Build frontend for production
cd front-end
npm run build
# Then copy build/ into backend/public/ before deploying to EB

# DB migrations (always run from backend/scripts/ dir)
cd backend/scripts
node someMigration.js
```

`.env` is resolved relative to each script using:
```js
path.resolve(__dirname, "../.env")
```

Never commit credentials, keys, or `.env` to the repo.

---

## Architecture Patterns

### Role-Based Access
- **Backend**: Routes enforce authentication via middleware. Always check `req.user.role`.
- **Frontend**: UI elements are gated by a `userRole` prop passed into components.
  Both layers must be independently enforced — do not rely on one to cover the other.

### API Routes Convention
```
GET    /resource          → list
GET    /resource/:id      → single item
POST   /resource          → create
PATCH  /resource/:id      → partial update
DELETE /resource/:id      → delete
```

### Frontend Component Props Pattern
Components receive `userRole` and `userId` (or `driverId`, `sponsorId`) as props. Guard
role-specific UI elements explicitly:
```jsx
{userRole === 'driver' && <button>Add to Cart</button>}
{userRole === 'sponsor' && <button>Hide Product</button>}
```

### Database Migrations
- Create a new file in `backend/scripts/` for each schema change
- Each script uses `tableExists()` / `columnExists()` checks so it is safe to re-run
- Run it once manually; document the change in a comment at the top of the file

---

## Critical Rules — Read Before Making Changes

1. **Always read the current file before editing it.** Do not modify stale versions.
   Regressions have happened from editing outdated file content.

2. **Never strip existing functionality.** When doing targeted edits, preserve all surrounding
   code — especially function declarations and closing braces.

3. **Role access must be enforced at BOTH layers** (backend route + frontend UI visibility).

4. **No computer-generated IDs visible to users.** All UI flows must use human-readable
   names/identifiers, not raw database IDs.

5. **Password security**: Always hash passwords (bcrypt). Never store or log plaintext.

6. **SQL injection**: Always use parameterized queries (`?` placeholders), never string
   concatenation in SQL.

7. **Audit logging**: Use the `writeAudit()` helper in `admin.js` / equivalent pattern in other
   routes. Every point change, login attempt, password change, and application decision must be
   logged to `audit_logs`.

---

## How to Give Me a Story or Task

Paste your user story or task using this format and I will implement it:

```
## Story / Task

**Title:** [Short descriptive title]

**As a** [driver | sponsor | admin]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] ...

**Notes / Context:**
- Any relevant implementation hints, table names, edge cases, or constraints
- Which files are likely involved (if known)
- Any related stories already completed
```

### Example

```
## Story / Task

**Title:** Driver can view their current point balance

**As a** driver
**I want to** see my current point total on my profile page
**So that** I know how many points I have available to spend

**Acceptance Criteria:**
- [ ] Point balance is displayed on the DriverProfile page
- [ ] Balance is fetched from the backend (not hardcoded)
- [ ] Balance updates after a purchase or point change

**Notes / Context:**
- Points are stored per-sponsor in drivers.points_balance (RC2)
- Active sponsor tracked in users.active_sponsor_id
- Relevant file: front-end/src/components/DriverProfile.js
- Backend route: GET /api/driver/points (already exists)
```

---

## Common Tasks Reference

### Add a new backend route
1. Create handler in `backend/src/routes/<resource>.js`
2. Register in `backend/src/index.js`: `app.use('/resource', resourceRouter)`
3. Add auth middleware: `router.use(requireActiveSession)`

### Add a new DB column / table
1. Write a migration script in `backend/scripts/`
2. Run it: `cd backend/scripts && node migration.js`
3. Update relevant route handlers and frontend components

### Add a new frontend page
1. Create component in `front-end/src/components/`
2. Add route in `front-end/src/App.js`
3. Add nav link in `front-end/src/components/Navbar.js` (gated by role if needed)

### Implement a role-gated feature
1. Backend: Add role check in route middleware
2. Frontend: Wrap JSX in `{userRole === 'X' && ...}` conditional
3. Test both the allowed role and disallowed roles

---

## Audit Logging

The following events MUST be logged to `audit_logs` (note: table is `audit_logs`, not `audit_log`):
- Driver application status changes (accept/reject)
- Point additions and deductions (with reason)
- Password changes
- Login attempts (success and failure)
- Identity assumption (admin or sponsor assuming a user)
- Sponsor lock/flag/warn/delete actions
- Driver flag/warn actions
- Bulk upload rows (success and failure)

Use the `writeAudit({ category, actorUserId, targetUserId, sponsorId, success, details })` helper
defined in `admin.js`. Replicate the same pattern in other route files.

---

## Reporting Requirements

Reports must be:
- **Visually appealing** (not plain CSV rendered in the browser — use PDFKit for PDF output)
- **Downloadable as CSV**
- **Filterable** by date range and by sponsor/driver

Required reports (partially implemented — see gap analysis):

| Report | Who | Status |
|--------|-----|--------|
| Driver Point Tracking | Sponsor + Admin | ✅ Implemented (`/sponsor/reports/points.csv` + `.pdf`) |
| Audit Log | Sponsor (own drivers only) | ❌ Not yet implemented |
| Sales by Sponsor | Admin | ❌ Not yet implemented |
| Sales by Driver | Admin | ❌ Not yet implemented |
| Invoice (per sponsor) | Admin | ❌ Not yet implemented |
| Audit Log (all sponsors) | Admin | ❌ Not yet implemented |

---

## Requirements Change #1 — Bulk Loading (RC#1) ✅ IMPLEMENTED

Sponsors and Admins can upload a pipe-delimited (`|`) file to bulk-create users.

**Admin file format:** `<type>|org name|first name|last name|email|points|reason`
**Sponsor file format:** `<type>|first name|last name|email|points|reason` (no org field)

| Type | Meaning           | Who can use |
|------|-------------------|-------------|
| `O`  | Create org        | Admin only  |
| `D`  | Driver record     | Admin + Sponsor |
| `S`  | Sponsor user      | Admin + Sponsor |

**Key rules (all implemented):**
- Errors are reported per-line; processing continues on error
- Sponsors use 6-field format (no org name column — their own org is implied)
- S type with points: user is created, points are warned but not applied
- Uploading an existing driver adds points; new driver is created and auto-accepted
- Uploaded drivers bypass the approval process
- Admins: org must exist OR be created by an `O` record earlier in the same file
- Transaction rollback per row on error — other rows continue processing
- Response includes `results` array (successes) and `errors` array (failures)

Backend: `POST /sponsor/bulk-upload` · `POST /admin/bulk-upload`
Frontend: Bulk Upload tab in `SponsorProfile.js` and `adminDashboard.js`

---

## Requirements Change #2 — Multiple Sponsors (RC#2) ✅ IMPLEMENTED (backend); ⚠️ Partial (frontend)

Drivers can be affiliated with multiple sponsors simultaneously. Points are isolated per sponsor.

**Key changes:**
- `drivers` table is now a join table: one row per (driver_user_id, sponsor_id) pair
- `drivers.points_balance` — per-sponsor point balance (set/updated by `award-points` route)
- `users.active_sponsor_id` — which sponsor's catalog + points the driver is currently viewing
- `driver_points_history` table tracks all point changes with `sponsor_id`

**Implemented backend routes:**
- `GET /api/driver/my-sponsors` — list all sponsors with per-sponsor `pointsBalance`
- `PATCH /api/driver/active-sponsor` — switch active sponsor (updates `users.active_sponsor_id`)
- `POST /api/driver/apply/:sponsorId` — apply to any sponsor
- `GET /admin/driver/:id/sponsors` — admin views all sponsors for a driver
- `POST /admin/driver/:id/assign-sponsor` — admin assigns a driver to an additional sponsor

**Known gaps (not yet wired up):**
- `GET /api/catalogue/points` still reads `users.points` (global) instead of `drivers.points_balance` for the active sponsor
- `POST /api/catalogue/purchases` deducts from `users.points` — not sponsor-scoped
- The Catalogue.js does not pass `active_sponsor_id` to filter products by sponsor

Migration: `backend/scripts/multiSponsorMigration.js`
