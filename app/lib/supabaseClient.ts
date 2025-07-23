import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vktpkkvioqaqsqnbltig.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrdHBra3Zpb3FhcXNxbmJsdGlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMjgyOTAsImV4cCI6MjA2ODcwNDI5MH0.UUl-XqE0EHlbBSl_dU2vTgfx-EcuNEW2bLu6PYialDk";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
