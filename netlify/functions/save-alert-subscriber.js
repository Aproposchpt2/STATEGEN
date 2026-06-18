'use strict';
// Save/update a StateGen bid-alert subscriber — HARD-GATED.
// Accepts EITHER a verified Stripe checkout session (new/paid) OR a subscriber token
// (returning subscriber updating keywords). No valid session/token → rejected.
// Email + state come from the PAYMENT, not the form.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const { getSession, evalSession } = require('./verify-checkout-session');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const j = (statusCode, obj) => ({ statusCode, headers: CORS, body: JSON.stringify(obj) });
const sbH = (extra = {}) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...extra });

function cleanKeywords(k) {
  const a = Array.isArray(k) ? k : String(k || '').split(',');
  return a.map(x => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 15);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return j(405, { error: 'POST only' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return j(400, { error: 'Invalid JSON' }); }

  const keywords = cleanKeywords(body.keywords);
  if (!keywords.length) return j(400, { error: 'Add at least one keyword.' });

  const sessionId = (body.session_id || '').trim();
  const token     = (body.token || '').trim();

  // ── Path A: new/paid subscriber via verified Stripe session ──────────────
  if (sessionId) {
    if (!sessionId.startsWith('cs_')) return j(400, { error: 'Invalid checkout session.' });
    const v = evalSession(await getSession(sessionId));
    if (!v.valid) return j(403, { error: v.error || 'A paid subscription is required.' });

    const res = await fetch(`${SUPABASE_URL}/rest/v1/state_alert_subscribers?on_conflict=email,state`, {
      method: 'POST',
      headers: sbH({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({
        email: v.email, state: v.state, keywords, status: 'active',
        stripe_customer_id: v.customer, stripe_subscription_id: v.subscription,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) { console.error('[save-alert]', await res.text()); return j(500, { error: 'Could not save. Please try again.' }); }
    const rows = await res.json();
    return j(200, { ok: true, state: v.state, email: v.email, count: keywords.length, token: rows && rows[0] && rows[0].token });
  }

  // ── Path B: returning subscriber updating keywords via their token ───────
  if (token) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/state_alert_subscribers?token=eq.${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: sbH({ Prefer: 'return=representation' }),
      body: JSON.stringify({ keywords, status: 'active', updated_at: new Date().toISOString() }),
    });
    if (!res.ok) { console.error('[save-alert]', await res.text()); return j(500, { error: 'Could not save. Please try again.' }); }
    const rows = await res.json();
    if (!rows || !rows.length) return j(404, { error: 'We couldn\'t find that alert profile.' });
    return j(200, { ok: true, state: rows[0].state, count: keywords.length, token });
  }

  // ── No proof of subscription ─────────────────────────────────────────────
  return j(403, { error: 'A paid subscription is required to turn on bid alerts.' });
};
