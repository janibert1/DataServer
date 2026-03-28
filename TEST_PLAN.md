# DataServer — Comprehensive Test Plan

This plan covers every feature across the web frontend, mobile app, and backend. Test each section in order.

---

## Prerequisites

- Fresh Docker Compose deployment (`docker compose up -d --build`)
- Run `docker compose exec backend npx prisma db push && docker compose exec backend node dist/seed.js`
- Admin account available (from seed)
- Second test user account (create via invitation)
- A few test files ready (image, PDF, text file, large file ~100MB)

---

## 1. Authentication & Accounts

### 1.1 Web — Login
- [ ] Login with valid email/password
- [ ] Login with wrong password → error message
- [ ] Login with non-existent email → error message
- [ ] Login with Google OAuth (if configured)
- [ ] "Forgot password" link → goes to reset page
- [ ] Session persists across page refresh
- [ ] Logout clears session, redirects to login

### 1.2 Web — Registration
- [ ] Open invitation link → registration page loads
- [ ] Register with valid details → account created
- [ ] Register with existing email → error
- [ ] Register via Google OAuth with invitation
- [ ] Email verification flow (check inbox, click link)
- [ ] Expired invitation → error page
- [ ] Revoked invitation → error page

### 1.3 Web — Password Reset
- [ ] Request reset email → email arrives
- [ ] Click reset link → new password form
- [ ] Set new password → can login with it
- [ ] Expired reset link → error

### 1.4 Web — 2FA (Security Page)
- [ ] Enable TOTP 2FA → QR code shown
- [ ] Scan QR, enter code → 2FA enabled
- [ ] Login now requires TOTP code
- [ ] Backup codes shown and work
- [ ] Disable 2FA with valid code

### 1.5 App — Login
- [ ] Set server URL → saves correctly
- [ ] Login with valid credentials
- [ ] Login with wrong password → error
- [ ] Google OAuth login (if configured)
- [ ] Session persists after app restart
- [ ] Forgot password link opens browser

---

## 2. My Drive (Root)

### 2.1 Web — My Drive
- [ ] Page loads, shows root folders and files
- [ ] "Quick Access" shows recent files (if any)
- [ ] Search bar filters files by name
- [ ] Sort by name / size / date — ascending and descending
- [ ] Toggle grid/list view
- [ ] Upload single file → appears in list, progress shown
- [ ] Upload multiple files simultaneously
- [ ] Upload large file (>100MB) → progress bar works
- [ ] Upload blocked extension (.exe) → rejected with error
- [ ] Create new folder → appears in list
- [ ] Click folder → navigates to folder view
- [ ] Click file → opens preview

### 2.2 App — My Drive
- [ ] Tab loads, shows root folders and files
- [ ] Search bar filters files
- [ ] Sort controls work (name, size, date)
- [ ] Toggle grid/list view
- [ ] Upload button visible
- [ ] Upload file → upload queue icon shows count badge
- [ ] Tap upload queue icon → progress panel visible
- [ ] Create folder via upload FAB menu
- [ ] Tap folder → navigates to folder screen
- [ ] Tap file → opens preview

---

## 3. Folder View

### 3.1 Web — Folder Page
- [ ] Breadcrumb shows correct path (root > parent > current)
- [ ] Breadcrumb links navigate correctly
- [ ] Files and subfolders displayed
- [ ] Upload into this folder → file appears here (not root)
- [ ] Create subfolder
- [ ] Sort and view mode work
- [ ] Permission badge shown for shared folders (non-owner)
- [ ] Back navigation works

### 3.2 App — Folder Screen
- [ ] Header shows folder name
- [ ] Breadcrumb trail visible
- [ ] Upload button visible (if CONTRIBUTOR/EDITOR/OWNER)
- [ ] Upload into folder → file lands in correct folder
- [ ] Create subfolder
- [ ] Permission badge for shared folders
- [ ] Back button returns to previous screen

---

## 4. File Actions (Context Menu / Long Press)

### 4.1 Web — File Context Menu (right-click)
- [ ] Preview → opens file preview
- [ ] Download → file downloads to computer
- [ ] Rename → dialog opens, name updates on confirm
- [ ] Star / Unstar → star icon toggles immediately
- [ ] Move to → MoveModal opens with folder tree
  - [ ] Expand folders to see children
  - [ ] Select "My Drive" as target
  - [ ] Select a subfolder as target
  - [ ] Click "Move here" → file moves
  - [ ] Click "Cancel" → nothing happens
- [ ] Trash → file disappears, appears in Trash page
- [ ] **(Removed)** Report — should NOT appear in menu
- [ ] **(Removed)** Version History — should NOT appear in menu

### 4.2 Web — Folder Context Menu
- [ ] Open → navigates into folder
- [ ] Rename → dialog opens, name updates
- [ ] Star / Unstar → toggles
- [ ] Share → opens sharing UI
- [ ] Move to → MoveModal (same as file)
- [ ] Trash → folder removed
- [ ] Folder context menu does NOT have Report or Version History

### 4.3 App — File Long Press Menu
- [ ] Preview
- [ ] Download → share sheet opens
- [ ] Rename → modal opens, enter new name → updates
- [ ] Star / Unstar → toggles
- [ ] Trash → **confirmation dialog appears** ("Are you sure?") → confirm moves to trash

### 4.4 App — Folder Long Press Menu
- [ ] Open → navigates to folder
- [ ] Rename → modal, name updates
- [ ] Star / Unstar → toggles
- [ ] Share → navigates to share view
- [ ] Trash → **confirmation dialog** → moves to trash

---

## 5. Drag and Drop

### 5.1 Web — Drag and Drop (Grid & List Views)
- [ ] Drag a file over a folder → folder highlights (blue ring)
- [ ] Drop file on folder → file moves into that folder
- [ ] Drag a folder over another folder → same behavior
- [ ] Drag a file over another file → highlight, drop triggers auto-create-folder dialog
  - [ ] Enter folder name → folder created, both files moved in
  - [ ] Click Cancel → nothing happens
- [ ] Drag and drop works in **grid** view
- [ ] Drag and drop works in **list** view
- [ ] Drag and drop works on **My Drive** page
- [ ] Drag and drop works on **Folder** page
- [ ] Cannot drop item on itself (no action)

### 5.2 App — Drag and Drop
- [ ] Long press file → drag indicator follows finger (blue square)
- [ ] Drag over folder → folder highlights
- [ ] Release on folder → file moves into folder
- [ ] Long press folder → drag, drop on another folder → moves
- [ ] Drag file onto another file → auto-create-folder modal appears
  - [ ] Enter name → folder created, both items moved
  - [ ] Cancel → dismissed
- [ ] Works on My Drive tab
- [ ] Works on Folder screen

---

## 6. Starred

### 6.1 Web — Starred Page
- [ ] Shows all starred files and folders
- [ ] Unstar from here → item disappears
- [ ] Star from My Drive → appears here immediately
- [ ] Star from Folder Page → appears here immediately
- [ ] Context menu actions work (rename, move, trash, download)

### 6.2 App — Starred Tab
- [ ] Shows starred files and folders
- [ ] Unstar via long-press → item removed
- [ ] Star from other screen → appears here on refresh

---

## 7. Shared

### 7.1 Web — Shared With Me
- [ ] Shows folders shared with current user
- [ ] Shows permission level per folder
- [ ] Click folder → opens folder view with permission badge
- [ ] VIEWER can only browse/view files
- [ ] DOWNLOADER can download
- [ ] CONTRIBUTOR can upload
- [ ] EDITOR can rename/move
- [ ] OWNER has full control

### 7.2 Web — Shared By Me
- [ ] Shows folders shared by current user
- [ ] Shows who each folder is shared with
- [ ] Can manage sharing (add/remove users, change permissions)

### 7.3 App — Shared Tab
- [ ] Shows shared folders with owner name and share date
- [ ] Tap folder → navigates to folder (not infinite loading)
- [ ] Permission badge shown
- [ ] Pull to refresh works

---

## 8. Trash

### 8.1 Web — Trash Page
- [ ] Shows trashed files and folders
- [ ] Restore file → returns to original location
- [ ] Permanently delete file → gone forever (with confirmation)
- [ ] Empty trash → all items permanently deleted (with confirmation)
- [ ] Trashed items show deletion date

### 8.2 App — Trash Tab
- [ ] Shows trashed items
- [ ] Restore works
- [ ] Permanent delete works
- [ ] Empty trash works
- [ ] Trashed file does NOT disappear silently (soft delete, not permanent)

---

## 9. Recent Files

### 9.1 Web — Recent Page
- [ ] Shows recently accessed/uploaded files
- [ ] Click → opens preview
- [ ] Context menu works

---

## 10. File Preview

### 10.1 Web
- [ ] Image files → displayed inline
- [ ] PDF files → rendered in viewer
- [ ] Text files → content shown
- [ ] Video files → video player
- [ ] Unknown types → download prompt
- [ ] Download button works from preview

### 10.2 App
- [ ] Image preview
- [ ] PDF preview
- [ ] Download/share from preview screen
- [ ] Back navigation

---

## 11. Settings

### 11.1 Web — Settings
- [ ] Display name editable
- [ ] Avatar upload works
- [ ] Storage quota shown (used / total with percentage)

### 11.2 Web — Security
- [ ] Change password (current + new)
- [ ] 2FA enable/disable (see section 1.4)
- [ ] Active sessions listed

### 11.3 App — Settings
- [ ] Display name, avatar
- [ ] Storage quota display
- [ ] Server URL shown
- [ ] Logout button works

### 11.4 App — Security
- [ ] Change password
- [ ] 2FA management

---

## 12. Admin Panel (Web Only)

### 12.1 Admin — Users
- [ ] List all users with pagination
- [ ] Search by name/email
- [ ] Filter by status (ACTIVE, SUSPENDED, DELETED)
- [ ] View user details (storage, file count, login info)
- [ ] Suspend user → status changes
- [ ] Restore user → status back to ACTIVE
- [ ] Delete user
- [ ] Set custom quota for user
- [ ] Change user role (ADMIN/USER)

### 12.2 Admin — Invitations
- [ ] List all invitations
- [ ] Create new invitation (single-use, multi-use, email-restricted)
- [ ] Set expiration date
- [ ] Revoke invitation
- [ ] Copy invitation link
- [ ] Filter by type/status

### 12.3 Admin — Audit Logs
- [ ] Logs displayed with pagination
- [ ] Filter by user
- [ ] Filter by action type
- [ ] Filter by date range
- [ ] Each log shows timestamp, user, action, details

### 12.4 Admin — Storage Stats
- [ ] Top users by storage displayed
- [ ] Total used vs total allocated shown

### 12.5 Admin — Content Flags
- [ ] List flagged content
- [ ] Filter by status (PENDING, REVIEWED)
- [ ] Review flag → update status with note

### 12.6 Admin — Policy
- [ ] Default quota per user (GB) → editable
- [ ] Max file size (GB) → editable
- [ ] Blocked extensions → add/remove tags
- [ ] Trash retention (days) → editable
- [ ] Version retention (count) → editable
- [ ] Save → toast success
- [ ] Reset → reverts to saved values

### 12.7 Admin — Server Storage Limit (NEW)
- [ ] Toggle "Enable server-wide storage limit" → fields appear
- [ ] Set capacity in GB → saves with policy
- [ ] Physical disk stats shown (total, available) — if local storage
- [ ] Currently occupied space shown
- [ ] Total allocated quotas shown
- [ ] Set capacity below occupied space → **error rejected**
- [ ] Set capacity above physical disk minus 2GB → **error rejected**
- [ ] Set capacity below total allocated quotas → **warning shown**
  - [ ] "Preview redistribution" button visible
  - [ ] Click → confirmation panel with redistribute action
  - [ ] Confirm → quotas proportionally reduced (no user below their used)
  - [ ] Cancel → dismissed
- [ ] Disable limit (toggle off) → saves null, uploads no longer limited
- [ ] Upload when server at capacity → **507 error** ("Server storage capacity exceeded")
- [ ] Upload when under capacity → works normally

---

## 13. Upload & Quota

- [ ] Upload file when user has quota → succeeds
- [ ] Upload file when user quota exceeded → error "Storage quota exceeded"
- [ ] Upload file when server capacity exceeded → error "Server storage capacity exceeded"
- [ ] Upload progress shown in web (progress bar)
- [ ] Upload progress shown in app (queue badge + progress panel)
- [ ] Upload into root folder
- [ ] Upload into subfolder
- [ ] Upload blocked file type → error
- [ ] Concurrent uploads (multiple files)

---

## 14. Folder Sharing Flow (End-to-End)

1. [ ] User A creates a folder
2. [ ] User A shares folder with User B as VIEWER
3. [ ] User B sees folder in "Shared With Me" (web) / "Shared" tab (app)
4. [ ] User B can browse but NOT upload
5. [ ] User A changes permission to CONTRIBUTOR
6. [ ] User B can now upload into the shared folder
7. [ ] User A revokes sharing
8. [ ] User B no longer sees the folder

---

## 15. Cross-Platform Consistency

- [ ] File uploaded on web appears in app
- [ ] File uploaded on app appears on web
- [ ] Star on web reflects in app (after refresh)
- [ ] Trash on app moves to trash on web
- [ ] Rename on one platform shows on the other
- [ ] Folder structure consistent across both

---

## 16. Edge Cases & Error Handling

- [ ] Upload with no internet → error (not silent failure)
- [ ] Very long file name → truncated in UI, full name accessible
- [ ] Special characters in file/folder name (spaces, unicode, dots)
- [ ] Empty folder → shows "This folder is empty" message
- [ ] Empty My Drive → shows "Your drive is empty" with upload prompt
- [ ] Session expired → redirected to login
- [ ] Non-admin accessing /admin routes → forbidden/redirected
- [ ] Guest accessing protected routes → redirected to login
- [ ] 404 page for invalid routes

---

## Test Completion Sign-Off

| Area | Web | App |
|------|-----|-----|
| Auth | [ ] | [ ] |
| My Drive | [ ] | [ ] |
| Folder View | [ ] | [ ] |
| File Actions | [ ] | [ ] |
| Drag & Drop | [ ] | [ ] |
| Starred | [ ] | [ ] |
| Shared | [ ] | [ ] |
| Trash | [ ] | [ ] |
| Recent | [ ] | N/A |
| File Preview | [ ] | [ ] |
| Settings | [ ] | [ ] |
| Admin Panel | [ ] | N/A |
| Storage Limit | [ ] | N/A |
| Upload & Quota | [ ] | [ ] |
| Sharing E2E | [ ] | [ ] |
| Cross-Platform | [ ] | [ ] |
| Edge Cases | [ ] | [ ] |
