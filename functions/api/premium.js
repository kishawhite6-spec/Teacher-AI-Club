// functions/api/premium.js
// Cloudflare Pages Function. Lives at the URL /api/premium.
//
// What it does: returns the members-only tool data (use cases + locked links)
// ONLY to a visitor who is logged in AND holds an active paid plan. Everyone
// else gets turned away. This is what makes the paywall real instead of visual.
//
// It talks to Memberstack over its REST API with plain fetch, so it runs on
// Cloudflare's edge with no extra packages to install.
//
// Cloudflare environment variables (Settings > Environment variables):
//   MEMBERSTACK_SECRET_KEY     required. Your sk_live_... key (or sk_sb_... while testing).
//   MEMBERSTACK_PAID_PLAN_IDS  optional but recommended. Comma-separated pln_ ids of your
//                              two paid plans. If set, only these count as "paid".
//                              If left blank, any active non-free plan counts.
//   MEMBERSTACK_APP_ID         optional. Your app_... id, for an extra check that the
//                              token was issued for this app.

import PREMIUM from "../_data/premium.js";

const ADMIN = "https://admin.memberstack.com/members";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store", // never cache member-specific data
    },
  });
}

// The page sends the token as "Authorization: Bearer ...". As a backup we also
// read the _ms-mid cookie that Memberstack sets when a member logs in.
function readToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)_ms-mid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const SECRET = env.MEMBERSTACK_SECRET_KEY;
  if (!SECRET) return json({ error: "Server not configured." }, 500);

  const token = readToken(request);
  if (!token) return json({ error: "Not logged in." }, 401);

  const headers = { "X-API-KEY": SECRET, "Content-Type": "application/json" };

  // 1) Verify the token is genuine and unexpired, and get the member id.
  let memberId, aud;
  try {
    const r = await fetch(`${ADMIN}/verify-token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token }),
    });
    if (!r.ok) return json({ error: "Invalid session." }, 401);
    const out = await r.json();
    memberId = out && out.data && out.data.id;
    aud = out && out.data && out.data.aud;
  } catch {
    return json({ error: "Could not verify session." }, 401);
  }
  if (!memberId) return json({ error: "Invalid session." }, 401);

  // Optional: confirm the token was issued for THIS app.
  if (env.MEMBERSTACK_APP_ID && aud && aud !== env.MEMBERSTACK_APP_ID) {
    return json({ error: "Wrong app." }, 401);
  }

  // 2) Load the member so we can read their plan status.
  let member;
  try {
    const r = await fetch(`${ADMIN}/${memberId}`, { headers });
    if (!r.ok) return json({ error: "Member not found." }, 401);
    const out = await r.json();
    member = out && out.data;
  } catch {
    return json({ error: "Could not load member." }, 401);
  }

  // 3) Does the member hold an ACTIVE paid plan?
  const allowed = (env.MEMBERSTACK_PAID_PLAN_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  const connections = Array.isArray(member && member.planConnections) ? member.planConnections : [];
  const isPaid = connections.some(c => {
    const active = c.status === "ACTIVE" || c.active === true;
    if (!active) return false;
    if (allowed.length) return allowed.includes(c.planId);
    return c.type && c.type !== "FREE"; // fallback when no plan ids are configured
  });

  if (!isPaid) return json({ error: "Premium required." }, 403);

  // 4) Verified paying member. Hand over the premium data.
  return json({ premium: PREMIUM });
}
