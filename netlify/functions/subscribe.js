// Netlify Function: subscribe
// Receives sponsor-page "Get Updates" signups (name, email, phone, channel
// preference) and writes them into the "Sponsor Page Signups" Notion
// database. A separate scheduled function reads Pending rows from that
// database and syncs them into Constant Contact, so this function never
// talks to Constant Contact directly and stays fast/simple for the visitor.

const NOTION_VERSION = "2022-06-28";
const SIGNUPS_DATA_SOURCE_ID = "204472f4-1508-4484-90be-37a4fee9ce05";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(s) {
  return (s || "").replace(/\D/g, "");
}

function isValidUSPhone(s) {
  const d = digitsOnly(s);
  return d.length === 10 || (d.length === 11 && d.startsWith("1"));
}

function formatPhoneE164(s) {
  const d = digitsOnly(s);
  const ten = d.length === 11 ? d.slice(1) : d;
  return "+1" + ten;
}

exports.handler = async function (event) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const name = (payload.name || "").trim();
  const email = (payload.email || "").trim();
  const phone = (payload.phone || "").trim();
  const channel = payload.channel; // "Text" | "Both" | "Email"
  const sourcePage = (payload.sourcePage || "").trim();
  // honeypot field: real visitors never fill this in
  const honeypot = (payload.company || "").trim();

  if (honeypot) {
    // Silently succeed for bots without writing anything.
    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  }

  if (!["Text", "Both", "Email"].includes(channel)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid channel preference" }) };
  }
  if (!name) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Name is required" }) };
  }
  if (channel === "Email" && !EMAIL_RE.test(email)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "A valid email is required" }) };
  }
  if ((channel === "Text" || channel === "Both") && !isValidUSPhone(phone)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "A valid 10-digit US phone number is required for text updates" }) };
  }
  if (channel === "Both" && !EMAIL_RE.test(email)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "A valid email is required" }) };
  }

  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) {
    console.error("subscribe: NOTION_TOKEN is not configured");
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Server not configured" }) };
  }

  const properties = {
    Name: { title: [{ text: { content: name } }] },
    "Channel Preference": { select: { name: channel } },
    "Sync Status": { select: { name: "Pending" } },
  };
  if (email) {
    properties.Email = { email };
  }
  if (phone) {
    properties.Phone = { phone_number: formatPhoneE164(phone) };
  }
  if (sourcePage) {
    properties["Source Page"] = { rich_text: [{ text: { content: sourcePage } }] };
  }

  try {
    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { data_source_id: SIGNUPS_DATA_SOURCE_ID },
        properties,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("subscribe: Notion write failed", res.status, errText);
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: "Could not save signup" }) };
    }

    return { statusCode: 200, headers: cors, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("subscribe: unexpected error", err);
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: "Unexpected server error" }) };
  }
};
