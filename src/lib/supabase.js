import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// the values from .env.example are placeholders, not a real project
const placeholder = (v) => !v || /your-project|your-anon-key/.test(v);
export const isConfigured = !placeholder(url) && !placeholder(key);
export const supabase = isConfigured
  ? createClient(url, key, { realtime: { params: { eventsPerSecond: 20 }, heartbeatIntervalMs: 15000 } })
  : null;

// for plain fetch calls (usage counter)
export const SUPABASE_URL = isConfigured ? url : "";
export const SUPABASE_KEY = isConfigured ? key : "";

// push notifications are on when a VAPID public key is set (see README)
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
export const pushConfigured = isConfigured && !!VAPID_PUBLIC_KEY;
