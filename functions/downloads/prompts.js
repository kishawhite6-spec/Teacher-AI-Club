// functions/downloads/prompts.js
//
// What this does, in plain terms:
// It hands out your free prompt pack PDF at the address
// https://teacheraiclub.net/downloads/prompts
//
// This link is public on purpose. It goes inside your Kit welcome
// email, and the email signup is what captures the address. There is
// no login wall here, so the link always works straight from a teacher's
// inbox.
//
// Two things make it work, both set up in the Cloudflare dashboard:
//   1. An R2 bucket binding named exactly: DOCS
//   2. A file uploaded to that bucket named exactly: 25-prompts.pdf

export async function onRequestGet(context) {
  const { env } = context;

  // Grab the PDF out of your R2 storage.
  const object = await env.DOCS.get("25-prompts.pdf");

  // If the file name does not match, say so clearly instead of breaking.
  if (!object) {
    return new Response("File not found in storage.", { status: 404 });
  }

  // Build the response headers so the browser knows it is a PDF.
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Content-Type", "application/pdf");
  headers.set(
    "Content-Disposition",
    'inline; filename="Teacher-AI-Club-25-Prompts.pdf"'
  );
  headers.set("Cache-Control", "public, max-age=3600");

  // Send the file.
  return new Response(object.body, { headers });
}
