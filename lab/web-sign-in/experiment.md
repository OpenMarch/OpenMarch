---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: web-sign-in
title: Sign in and upload to the mobile app from the web editor
summary: The web editor can now sign in with your OpenMarch account (on Clerk's sign-in page, in a new tab) and upload a show to the mobile app, like the desktop app.
status: open
questions:
  - Did signing in work, and did the editor notice once you'd finished in the other tab?
  - Did the sign-in tab close by itself afterwards?
  - Were you already signed in if you were signed in to app.openmarch.com?
  - Did uploading to the mobile app work as it does in the desktop app?
  - Did signing out work, and did it sign you out of app.openmarch.com too?
---

Open **File → Export to mobile** (or **Export → Mobile**).

**What to try**

- Click **Sign in**. OpenMarch's sign-in page opens in a new tab. Sign in
  there; the tab should say you're signed in and close, and the editor
  should show your account.
- If you're already signed in at app.openmarch.com, the editor should know
  without asking.
- Pick an ensemble and upload the show, as in the desktop app.
- Sign out from your account menu in the Mobile export panel.
- Try it with pop-ups blocked: the editor asks before leaving the show, then
  signs in in the same tab and comes back.

Uploading needs the server change that allows the web editor's address
(om-online); until that's deployed, signing in works but listing ensembles
fails.
