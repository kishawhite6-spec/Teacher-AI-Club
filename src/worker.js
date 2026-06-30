// src/worker.js
// The single entry point for the Teacher AI Club Worker.
//
// In plain terms: this is the "front door." Cloudflare serves your static
// pages (index.html, directory.html, and so on) straight from the edge and
// never runs this code for them. This code runs ONLY for the address below.
// Anything else is handed back to the static files.
//
//   /api/premium  ->  the paywall check (returns paid content to members)
//
// Everything else  ->  env.ASSETS.fetch(request)  (your normal website)
//
// NOTE: the free prompts PDF is intentionally NOT handled here. It is a
// separate, public, top-of-funnel magnet delivered by a direct link
// (files.teacheraiclub.net), and it is not a premium feature.

import { handlePremium } from "./premium.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/premium") {
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405 });
      }
      return handlePremium(request, env);
    }

    // Not our route: serve the static site (or its 404 page).
    return env.ASSETS.fetch(request);
  },
};
