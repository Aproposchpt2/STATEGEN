'use strict';
// Capture a StateGen lead (name + email + phone) before the demo or pricing.
// Shared backend on the NevadaStateGen site; the CalStateGen pages post here cross-origin.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'POST only' }) };

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const first_name = (b.first_name || '').trim();
  const last_name  = (b.last_name || '').trim();
  const email      = (b.email || '').trim().toLowerCase();
  const phone      = (b.phone || '').trim() || null;
  const state      = (b.state || '').trim().toUpperCase() || null;
  const source     = (b.source || '').trim() || null;

  if (!first_name) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'First name is required.' }) };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'A valid email is required.' }) };

  // Best-effort insert — never block the user from reaching the demo/pricing on a DB blip.
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/state_leads`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ first_name, last_name, email, phone, state, source }),
    });
  } catch (e) { console.error('[submit-state-lead]', e.message); }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
};
