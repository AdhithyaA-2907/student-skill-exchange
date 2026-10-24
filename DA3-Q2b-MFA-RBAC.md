# DA3 Question 2(b) — Admin MFA and role-based authorization

## Implementation

The Admin/Supervisor role is `students.role = 'admin'`. The backend migration
`backend/migrations/004_add_admin_totp_mfa.sql` adds a nullable `totp_secret` and a
`totp_enabled` flag defaulting to `0`. Existing accounts remain valid and MFA starts
disabled. The migration is idempotent and must be applied to the Railway database
before deploying the updated API.

Admin MFA uses RFC 6238 TOTP with 6-digit, 30-second codes and a one-step clock drift
window. Google Authenticator and Microsoft Authenticator can scan the QR code or use
the manual setup key. The server verifies the code before enabling MFA or creating a
new Admin login session. Student login and the existing server-side Bearer session
format are unchanged.

Only authenticated Admins can provision or enable MFA. The setup endpoint returns a
QR image and manual key to that Admin so the authenticator can be enrolled; do not
save, share, or capture the unredacted setup screen. The secret is never logged or
included in profile, session, dashboard, or login responses.

Admin-only record updates and deletions use these existing routes:

| Operation | Endpoint | Authorization |
|---|---|---|
| Update/delete student account | `PUT/DELETE /api/admin/students/:id` | Admin only |
| Update/delete skill record | `PUT/DELETE /api/admin/skills/:id` | Admin only |
| Update Admin profile | `PUT /api/admin/profile` | Admin only |

They use the authenticated session's database role. Requests without a valid session
receive 401; a valid Student session receives 403. Student-owned self-service profile,
skill, and exchange workflows retain their existing ownership checks.

## Deployment

1. Back up the Railway database using the existing project procedure.
2. Apply `backend/migrations/004_add_admin_totp_mfa.sql` to the same Railway database
   used by the API. The migration only adds two columns; it does not alter records.
3. Deploy the updated backend and frontend together. No new environment variables are
   required; existing Railway database settings and Admin frontend API URL are used.
4. Sign in as an Admin and visit `/admin/mfa-setup`. Scan the QR code, enter the current
   6-digit code, and confirm the dashboard opens. A later Admin login requires both
   password and TOTP.

## DA3 screenshot checklist

Use the same test Admin account for evidence. Redact names, email addresses, IDs, and
any other personal data before submission.

1. **MFA setup screen** — capture `/admin/mfa-setup` after the QR is generated. Keep
   the setup page title, app instructions, QR area, verification field, and Enable MFA
   button visible. Blur or cover the QR code and manual key in the submitted copy so
   the enrollment secret cannot be recovered from the image.
2. **MFA login prompt** — after MFA is enabled, capture `/admin/login` with User ID or
   email, Password, and the 6-digit Authenticator code field visible. Do not include
   entered credentials or a live code.
3. **Successful MFA login** — enter the correct current code and capture the Admin
   Dashboard after it loads. Keep the dashboard title and Admin navigation visible;
   remove personal identifiers if any appear.
4. **Unauthenticated update rejected** — in Postman, send `PUT
   http://localhost:5000/api/admin/students/1` with an empty JSON body and no
   Authorization header. Capture the request URL, absent Authorization header, and
   response status/body showing `401 Unauthorized`. Do not use a real update payload.
5. **Wrong role rejected** — send the same request with a valid Student Bearer token
   and an empty JSON body. Capture the request URL and response status/body showing
   `403 Forbidden`. Keep the token hidden in the screenshot (mask the Authorization
   value while leaving the header name visible).
6. **Database state** — run a read-only query in the Railway SQL console:

   ```sql
   SELECT student_id, user_id, role, totp_enabled
   FROM students
   WHERE user_id = 'TEST_ADMIN_USER';
   ```

   Replace the filter with the test Admin ID and redact the ID in the submitted
   screenshot if required. Never select `password_hash`, `totp_secret`, or session
   token data.

Use an existing designated test Admin and Student account if available. Do not create
extra accounts or delete records for the screenshots.
