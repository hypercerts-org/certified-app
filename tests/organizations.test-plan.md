# Organizations Feature — Behavioral Test Plan

## Prerequisites
- User is authenticated (signed in)
- Dev server running at http://localhost:3000

---

## T1: Navigation — Organizations link visible
1. Navigate to http://localhost:3000
2. Verify "Organizations" appears in the top navbar links
3. Verify "Organizations" appears in the sidebar navigation

## T2: Organizations page — Empty state
1. Navigate to http://localhost:3000/organizations
2. Verify the page title "Organizations" is displayed
3. Verify empty state with "No organizations yet" message is shown
4. Verify "Create Organization" button is visible
5. Verify "Add Existing" button is visible

## T3: Create Organization page — Renders correctly
1. Click "Create" button on the Organizations page (or navigate to /organizations/create)
2. Verify page title "Create Organization" is displayed
3. Verify "Organization name" input field exists
4. Verify "Handle" input field exists
5. Verify "Cancel" and "Create Organization" buttons exist
6. Verify "Create Organization" button is disabled when fields are empty

## T4: Create Organization — Form validation
1. Navigate to /organizations/create
2. Type a name longer than 64 characters → verify error message
3. Clear name, type a handle with uppercase → verify it auto-lowercases
4. Type handle with special chars (e.g. "my org!") → verify they are stripped
5. Type a handle shorter than 2 chars → verify error on blur/submit
6. Fill valid name "Test Org" and handle "test-org" → verify button becomes enabled

## T5: Create Organization — Submission (requires group service)
1. Fill name "Test Org" and handle "test-org"
2. Click "Create Organization"
3. Observe loading state on button
4. If group service is unavailable, verify error message is shown gracefully
5. If group service responds, verify redirect to /organizations

## T6: Add Existing Organization modal
1. Navigate to /organizations
2. Click "Add Existing" button
3. Verify modal appears with title "Add Existing Organization"
4. Verify "Organization DID" input field exists
5. Verify "Your role" dropdown exists with options: Member, Admin, Owner
6. Verify "Cancel" and "Add Organization" buttons exist
7. Click "Cancel" → verify modal closes

## T7: Account Switcher — Dropdown renders
1. On any authenticated page, click the avatar/chevron in the top-right navbar
2. Verify dropdown menu appears
3. Verify "User" section with personal account is shown
4. If organizations exist, verify "Organizations" section appears

## T8: Organization Profile page — Renders
1. If an org exists, navigate to /organizations/{groupDid}
2. Verify the org name is displayed
3. Verify DID is shown in the Identity section
4. Verify "Edit Profile", "Apps", and "Settings" actions exist

## T9: Organization Edit Profile page — Renders
1. Navigate to /organizations/{groupDid}/edit-profile
2. Verify "Display name", "About", and "Website" fields exist
3. Verify "Cancel" and "Save Changes" buttons exist

## T10: Organization Apps page — Mirrors personal
1. Navigate to /organizations/{groupDid}/apps
2. Verify "Explore apps" section appears
3. Verify the same apps from the personal apps page are listed

## T11: Organization Settings page — Members section
1. Navigate to /organizations/{groupDid}/settings
2. Verify "Handle" section shows the org handle
3. Verify "Members & Roles" section exists
4. If admin, verify "Add member" form with DID input and role dropdown
5. Verify "Activity Log" section exists (for admin+)

## T12: Organization Settings — Activity log empty state
1. Navigate to /organizations/{groupDid}/settings
2. Verify "Activity Log" section shows "No activity recorded yet." when empty

## T13: Auth guard — Unauthenticated redirect
1. Sign out
2. Navigate directly to /organizations
3. Verify redirect to /?returnTo=%2Forganizations

## T14: XRPC allowlist — Membership collection
1. (API test) Verify that PUTing a record to `app.certified.actor.membership` collection succeeds (not blocked by allowlist)
2. (API test) Verify that PUTing a record to `app.certified.actor.organization` collection succeeds

## T15: CSS — No visual regressions
1. Navigate to /organizations → verify page renders without broken layout
2. Navigate to /organizations/create → verify form is properly styled
3. Open account switcher → verify dropdown is positioned correctly
4. On mobile viewport (375px) → verify responsive layout works
