-- Daily reminders: run once in Supabase SQL Editor AFTER deploying the
-- sl-push function (see README). Replace the two placeholders first:
--   YOUR-PROJECT-REF  (from your project URL: https://YOUR-PROJECT-REF.supabase.co)
--   YOUR-CRON-SECRET  (the same value you set with: supabase secrets set CRON_SECRET=...)
-- Database -> Extensions: pg_cron and pg_net must be enabled (this tries to).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('squadlist-remind') where exists (select 1 from cron.job where jobname = 'squadlist-remind');
select cron.schedule(
  'squadlist-remind',
  '0 * * * *',  -- every hour, on the hour; each phone gets it at its own chosen local hour
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/sl-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{"type":"remind"}'::jsonb
  );
  $$
);
