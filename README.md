# Squadlist

Checklists with your friends. Add tasks for yourself or for each other, tick them off, and keep the
squad streak alive. Up to 10 friends per room. No accounts.

Built with React + Vite, Tailwind, Motion, Supabase (realtime, storage), a Vercel function for notifications and a PWA service worker.

## What's in it
- **Rooms**: room name + passcode (same pair opens the same room on any phone), or a quick room with a share link
- **Profiles**: name, color, emoji. Each phone stays signed in as its person (a secret key on the phone, checked by the
  database on every change), so nobody can tick or edit as someone else. New phone: Settings → **Use me on another phone**
- **Tasks for anyone**: for yourself, a friend, or everyone at once. Tasks from a friend show their initial ("from Rahul")
- **Once or repeating**: every day, weekdays or picked days; Today / Tomorrow / a date for one-off tasks
- **Mine** tab: Overdue, Today (drag ⋮⋮ to reorder), Done today, Upcoming, Other days
- **Squad** tab: **challenges** on top, then each friend's day: **Nudge 👉** unfinished tasks, **react** 🔥👏💪😂💀 to finished ones
- **Photo proof 📸**: tick with a photo from the camera or gallery; whoever adds a task can require one. Photos are shrunk on the phone (~150 KB)
- **Comments** on every task (tap a task)
- **Streaks**: a day counts when you finish **at least half** of that day's tasks. The **squad streak** grows when everyone who had
  tasks hit half. Days with nothing to do don't break it
- **Streak freezes 🧊**: earn one for every 7 days you hit half (hold up to 2). Missed yesterday? Use one to save it
- **Challenges 🏆**: "first to 10 gym days": everyone checks in once a day, first to the goal wins
- **Badges**: 14 of them (streaks, squad goals, task giver, nudge lord, receipts, early bird, champion…)
- **Notifications**: nudges, new tasks and comments on your phone, plus an optional daily "tasks left" reminder
- **Feed**, **Stats** (weekly MVP, heatmap per friend), dark mode, installable on your home screen
- **/admin**: data use per phone, free-plan limits and the monthly cost estimate

## Run it
```bash
npm install
npm run dev
```
Without Supabase keys it runs in **demo mode**: saved in this browser only. Open the room in two tabs to play two friends.

## Use it with real friends (Supabase, free)
1. Create a project at https://supabase.com
2. **SQL Editor** → paste all of `supabase/schema.sql` → **Run** (safe to run again after updates).
   This also creates the `proofs` storage bucket for photos.
3. **Project Settings → API**: copy the Project URL and the anon key into `.env.local` (see `.env.example`)
4. Deploy on Vercel with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then share the room link

## Notifications (optional)
Real phone notifications, even when Squadlist is closed: nudges, new tasks from friends, a friend finishing a task
you gave them, comments on your tasks,
and a daily "N tasks left" reminder at the hour each person picks. Sent by `api/notify.js`, a Vercel function that
deploys with the app. On iPhone this needs iOS 16.4+ and Squadlist added to the home screen (Share → Add to Home Screen).

1. `npm run push:keys` prints a public and a private key. Make a push token too:
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. Vercel → Settings → Environment Variables, then redeploy:
   - `VITE_VAPID_PUBLIC_KEY` = the public key
   - `VAPID_PRIVATE_KEY` = the private key (never in the app; only the server function reads it)
   - `PUSH_TOKEN` = the push token
3. Supabase → SQL Editor: run `supabase/schema.sql` (safe to run again), then put your site address and the same
   `PUSH_TOKEN` into `supabase/push.sql` and run it. That saves the token in the database and starts the hourly
   reminder job.
4. On each phone: Settings (tap your avatar) → turn on **Notifications**.

The server only sends what the database confirms: a real nudge, task or comment from the last 2 minutes, to the
right people, once.

## Admin page (data use and cost)
Open **`/admin`** on your site (e.g. `https://your-app.vercel.app/admin`) to see how much data each phone uses
(live updates, loading and saving, photos, the app itself), the rooms, how close you are to Supabase's free-plan
limits, and what it would cost per month (projected to the end of the month).

Set the password once, in Supabase → **SQL Editor** (after running `supabase/schema.sql`):

```sql
select public.sl_set_admin_password('a long password only you know');
```

The password is checked inside the database and stored scrambled (bcrypt), never in the app's code. Five wrong tries
lock the page for 15 minutes. Run the same line again to change it.

Only sizes and counts are collected, never what anyone writes. Usage rows older than 90 days are deleted automatically.
Plan limits and prices live in `src/lib/pricing.js`; check https://supabase.com/pricing and update them if they change.

## Tests
```bash
npm test   # streaks, freezes, lists, challenges, badges, cost estimate, notifications
```

## Layout
```
src/lib/streak.js       which tasks count on a day, the 50% rule, streaks, freezes, heatmap data
src/lib/lists.js        a person's list: overdue / today / done / upcoming / other days
src/lib/goals.js        challenge winners, badges
src/lib/api.js          Supabase or demo backend, same functions
src/lib/photo.js        shrink + upload photo proofs
src/lib/push.js         turn notifications on/off, ask the server to notify
src/lib/usage.js        data counter for /admin (sizes only)
src/lib/pricing.js      Supabase limits and prices, cost estimate
src/hooks/useSquad.js   room state, realtime broadcast + presence, reload on return
src/components/         Lobby, Profile, Room, Views (tabs), TaskItem, TaskSheet, AddTask, Challenges, Admin, ui
public/push-sw.js       shows notifications (loaded into the service worker)
supabase/schema.sql     tables + the only functions the app may call
api/notify.js           Vercel function that sends notifications (logic in api/_lib/notify-core.js)
supabase/push.sql       hourly reminder job (pg_cron)
```
