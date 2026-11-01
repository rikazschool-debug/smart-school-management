// One-time: stores the Storage URL + service key in Supabase Vault for the scheduled file cleanup job.
// Run: NODE_PATH=node_modules bun scripts/set-cleanup-credentials.ts   (prints nothing secret)
import { createClient } from "@supabase/supabase-js";
const a = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const r = await a.rpc("set_cleanup_credentials", { _url: process.env.SUPABASE_URL!, _key: process.env.SUPABASE_SERVICE_ROLE_KEY! });
console.log(r.error ? "error: " + r.error.message : "stored");
