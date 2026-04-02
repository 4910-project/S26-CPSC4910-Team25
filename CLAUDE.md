# Good Driver Incentive Program — Claude Code Guide

## Project Overview

A full-stack web application for a trucking industry driver incentive program. Sponsors award
points to drivers for good on-road behavior; drivers redeem points in a sponsor-curated product
catalog (sourced from the iTunes public API). The company earns 1% of total sales.

**Three user roles:** Drivers, Sponsor Users, Admin Users.

---

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React, running on `localhost:3000` |
| Backend  | Node.js / Express, running on `localhost:8001` |
| Database | MySQL (AWS RDS in production)     |
| API      | iTunes Search API (product catalog) |
| Deploy   | AWS (Amplify / EC2 + automated CI/CD) |

---

## Repository Structure

```
/
├── front-end/
│   └── src/
│       ├── components/         # Shared/reusable components
│       ├── pages/              # Page-level components (DriverProfile.js, Catalogue.js, etc.)
│       └── App.js
├── backend/
│   └── src/
│       ├── routes/             # Express route handlers
│       ├── db.js               # MySQL connection pool
│       └── server.js
├── scripts/                    # DB migration scripts (run from this dir)
│   └── *.js
└── CLAUDE.md                   # This file
```

---

## Key Database Tables

| Table                    | Purpose                                          |
|--------------------------|--------------------------------------------------|
| `users`                  | All users; `role` column = driver/sponsor/admin  |
| `driver_applications`    | Pending/approved/rejected driver applications    |
| `driver_cart`            | Items a driver has added to their cart           |
| `driver_preferences`     | Per-driver settings (e.g., Do Not Disturb)       |
| `driver_hidden_products` | Products a driver has hidden from their catalogue|
| `sponsor_hidden_products`| Products a sponsor has hidden from their drivers |
| `point_transactions`     | Point add/deduct history with reason             |
| `audit_log`              | Audit events: logins, password changes, etc.     |
| `orders`                 | Purchase records                                 |
| `about_info`             | About page data (team #, version, release date)  |

---

## Environment & Running Locally

```bash
# Backend
cd backend
npm install
npm start          # starts on port 8001

# Frontend
cd front-end
npm install
npm start          # starts on port 3000

# DB migrations (always run from scripts/ dir)
cd scripts
node someMigration.js
```

`.env` is resolved relative to each script location using:
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
- Create a new file in `scripts/` for each schema change
- Run it once manually; document the change in a comment at the top of the file

---

## Critical Rules — Read Before Making Changes

1. **Always read the current file before editing it.** Do not modify stale versions.
   Regressions have happened from editing outdated file content.

2. **Never strip existing functionality.** When doing targeted edits (e.g., `str_replace`),
   preserve all surrounding code — especially function declarations and closing braces.

3. **Role access must be enforced at BOTH layers** (backend route + frontend UI visibility).

4. **No computer-generated IDs visible to users.** All UI flows must use human-readable
   names/identifiers, not raw database IDs.

5. **Password security**: Always hash passwords (bcrypt). Never store or log plaintext.

6. **SQL injection**: Always use parameterized queries (`?` placeholders), never string
   concatenation in SQL.

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
- Points are stored in the `users` table as `point_balance`
- Relevant file: front-end/src/pages/DriverProfile.js
- Backend route: GET /drivers/:id/points (already exists)
```

---

## Common Tasks Reference

### Add a new backend route
1. Create handler in `backend/src/routes/<resource>.js`
2. Register in `backend/src/server.js`: `app.use('/resource', resourceRouter)`
3. Add auth middleware: `router.use(requireAuth)`

### Add a new DB column / table
1. Write a migration script in `scripts/`
2. Run it: `cd scripts && node migration.js`
3. Update relevant route handlers and frontend components

### Add a new frontend page
1. Create component in `front-end/src/pages/`
2. Add route in `App.js`
3. Add nav link in `Navbar.js` (gated by role if needed)

### Implement a role-gated feature
1. Backend: Add role check in route middleware
2. Frontend: Wrap JSX in `{userRole === 'X' && ...}` conditional
3. Test both the allowed role and disallowed roles

---

## Audit Logging

The following events MUST be logged to `audit_log`:
- Driver application status changes (accept/reject)
- Point additions and deductions (with reason)
- Password changes
- Login attempts (success and failure)

When implementing any feature that touches these areas, include an `INSERT INTO audit_log` call.

---

## Reporting Requirements

Reports must be:
- **Visually appealing** (not plain CSV rendered in the browser)
- **Downloadable as CSV**
- **Filterable** by date range and by sponsor/driver

Required reports:
- **Sponsor**: Driver Point Tracking, Audit Log (own drivers only)
- **Admin**: Sales by Sponsor, Sales by Driver, Invoice (per sponsor), Audit Log (all)

---

## Requirements Change #1 — Bulk Loading (Tag: RC#1)

Sponsors and Admins can upload a pipe-delimited (`|`) file to bulk-create users.

**File format:** `<type>|org name|first name|last name|email|points|reason`

| Type | Meaning           | Who can use |
|------|-------------------|-------------|
| `O`  | Create org        | Admin only  |
| `D`  | Driver record     | Admin + Sponsor |
| `S`  | Sponsor user      | Admin + Sponsor |

**Key rules:**
- Errors are reported per-line; processing continues on error
- Sponsors omit the org name field (their own org is implied)
- Points cannot be assigned to Sponsor users
- Uploading an existing driver adds points; new driver is created first
- Uploaded drivers are auto-accepted (no approval step)
- Admins: org must exist OR be created by an `O` record earlier in the same file

All stories for this feature must be tagged `RC#1` in the backlog.