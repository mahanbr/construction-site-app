/* ============================================================
   supabaseClient.js
   Fill in SUPABASE_URL and SUPABASE_ANON_KEY below with your
   project's values (Project Settings -> API in the Supabase
   dashboard). Only ever use the anon/public key here — never the
   service-role key, which must never appear in frontend code.
   ============================================================ */

const SUPABASE_URL = 'https://nbglzlwcciaxlamtlpij.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZ2x6bHdjY2lheGxhbXRscGlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3NzMyMDIsImV4cCI6MjEwNDM0OTIwMn0.xuudZLW_hGZ_BSckQSn8X302fXpxveCl0gyvMBZbuvY';

// The Supabase JS SDK is loaded via <script> tag in each HTML page
// (see index.html etc.) from the official CDN, exposing `window.supabase`.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
