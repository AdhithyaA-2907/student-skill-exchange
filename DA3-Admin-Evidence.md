# SkillSwap Admin/Supervisor evidence

## Scope

This implementation provides separate Student and Admin/Supervisor sign-in paths.
It keeps bcrypt password hashing, Bearer-token sessions, and the existing Admin
Dashboard. It does not implement TOTP MFA or an Admin request/approval workflow.

## Database

`students.role` remains `ENUM('student', 'admin') NOT NULL DEFAULT 'student'`.
The dedicated `POST /api/admin/register` route creates an `admin` role on the server;
it ignores any client-supplied role. The normal student registration route still
creates only `student` accounts.

Railway also contains the unused `admin_status` and `admin_requested_at` columns from
the earlier local experiment. They are intentionally left untouched to avoid changing
live records. The application no longer reads or writes them.

## URLs

- Student login: `/`
- Admin login: `/admin/login`
- Admin registration: `/admin/register`
- Admin dashboard: `/admin/dashboard`
- Students: `/admin/students`
- Skills: `/admin/skills`
- Exchanges: `/admin/exchanges`
- Notifications: `/admin/notifications`
- Admin profile: `/admin/profile`

## APIs

- `POST /api/auth/login` — student login.
- `POST /api/students` — student registration; server sets the student role.
- `POST /api/admin/register` — dedicated Admin/Supervisor registration.
- `POST /api/admin/login` — Admin/Supervisor login by User ID or email.
- Existing protected `/api/admin/*` dashboard, student, skill, exchange,
  notification, and profile APIs remain unchanged.

Protected Admin APIs return `401` with no token, `403` with a valid student token,
and allow a valid admin token.

## Actual local verification

- Normal student registration was tested with a client-supplied `role` value; the
  server stored and returned the account as `student`.
- Dedicated Admin registration was tested; the server stored the account as `admin`
  with a bcrypt hash. The hash was checked without being printed.
- Admin login by email was tested and the response contained no password hash.
- Admin dashboard authorization was verified: no token = `401`, student token =
  `403`, Admin token = `200`.

## Test commands

```powershell
cd "C:\Users\Adhithya\Desktop\Desktop backup\New folder\Social Science\StudentSkillExchange\backend"
node --check server.js
node --check ..\frontend\app.js
node --check ..\frontend\admin\admin.js
npm start
```

Unauthenticated Admin API check:

```powershell
Invoke-WebRequest http://localhost:5000/api/admin/dashboard
```

## Required DA3 screenshots

1. Main Student Login page/modal, including **Admin / Supervisor? Sign in here**.
2. `/admin/login`, showing User ID or Email and password fields.
3. `/admin/register`, showing Name, User ID, Email, Password, and Confirm Password.
4. The Admin registration success message: **Admin account created successfully. Please sign in.**
5. Successful Admin login followed by `/admin/dashboard`.
6. Browser/API-client response for Admin API without a token: HTTP `401`.
7. Browser/API-client response for a student token on Admin API: HTTP `403`.
8. Browser/API-client response for an admin token on Admin API: HTTP `200`.
9. Safe Railway database evidence that the test admin has `role='admin'`.

Use this safe evidence query. Do not select `password_hash`, sessions, or tokens:

```sql
SELECT student_id, user_id, name, email, role
FROM students
WHERE user_id = 'YOUR_TEST_ADMIN_USER_ID';
```
