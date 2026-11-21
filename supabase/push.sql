-- Daily "tasks left" reminders. Run once in Supabase -> SQL Editor, after
-- supabase/schema.sql and after setting PUSH_TOKEN on Vercel (see README).
-- Replace the placeholder first (a filled-in copy is made locally as push.local.sql):
--   (site address is already filled in: squadlist.vercel.app)
--   YOUR-PUSH-TOKEN       the same PUSH_TOKEN you put on Vercel
-- Database -> Extensions: pg_cron and pg_net must be enabled (this tries to).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- lets the database answer api/notify.js (same token as on Vercel)
select public.sl_set_push_token('YOUR-PUSH-TOKEN');

select cron.unschedule('squadlist-remind') where exists (select 1 from cron.job where jobname = 'squadlist-remind');
select cron.schedule(
  'squadlist-remind',
  '0 * * * *',  -- every hour, on the hour; each phone gets it at its own chosen local hour
  $$
  select net.http_post(
    url := 'https://squadlist.vercel.app/api/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-token', 'YOUR-PUSH-TOKEN'),
    body := '{"type":"remind"}'::jsonb
  );
  $$
);
