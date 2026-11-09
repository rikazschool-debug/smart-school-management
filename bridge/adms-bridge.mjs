#!/usr/bin/env node
// Rikaz ADMS bridge — receives ZKTeco "ADMS / Cloud Server" pushes over plain HTTP and forwards ONLY
// attendance rows (ATTLOG: user number + time) to Rikaz's signed intake. Fingerprint/face templates,
// user lists, photos and operation logs are never read or forwarded.
// No dependencies: Node 18+.  Run:  node adms-bridge.mjs   (settings below via environment variables)
//
//   RIKAZ_URL      https://kalmalki.lovable.app            (Rikaz site)
//   DEVICE_ID      device id shown in Rikaz
//   DEVICE_SECRET  link key shown once in Rikaz (keep private)
//   DEVICE_SN      serial number printed on the device (only this device is accepted)
//   PORT           8081 (the "Server Port" entered on the device)
//   TZ_OFFSET      +03:00 (device clock time zone)
import http from "node:http";
import crypto from "node:crypto";

const URL_ = (process.env.RIKAZ_URL || "").replace(/\/+$/, "");
const ID = process.env.DEVICE_ID || "", SECRET = process.env.DEVICE_SECRET || "", SN = (process.env.DEVICE_SN || "").toUpperCase();
const PORT = Number(process.env.PORT || 8081), TZ = process.env.TZ_OFFSET || "+03:00";
const VERSION = "rikaz-adms-1";
if (!URL_ || !ID || !SECRET || !SN) { console.error("Set RIKAZ_URL, DEVICE_ID, DEVICE_SECRET and DEVICE_SN"); process.exit(1); }

let deviceSeen = null, lastBeat = 0;
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function send(punches) {
  const body = JSON.stringify({ punches, sn: SN, info: { bridge: VERSION, ...(deviceSeen ? { device_seen: deviceSeen } : {}) } });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
  const r = await fetch(`${URL_}/api/public/hr/attendance`, { method: "POST", headers: { "content-type": "application/json", "x-rikaz-device": ID, "x-rikaz-timestamp": ts, "x-rikaz-signature": sig }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(`Rikaz refused: ${r.status} ${j.code ?? ""}`);
  return j;
}

// "PIN\tYYYY-MM-DD HH:MM:SS\tstatus\tverify..." → { employee_no, at, ref }
export function parseAttlog(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const f = line.split("\t"); if (f.length < 2) continue;
    const pin = f[0].trim(), dt = f[1].trim();
    if (!/^[A-Za-z0-9]{1,40}$/.test(pin) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dt)) continue;
    out.push({ employee_no: pin, at: `${dt.replace(" ", "T")}${TZ}`, ref: `${SN}:${pin}:${dt}` });
  }
  return out;
}

const reply = (res, code, text) => { res.writeHead(code, { "content-type": "text/plain" }); res.end(text); };

http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"), sn = (u.searchParams.get("SN") || "").toUpperCase();
  if (!u.pathname.startsWith("/iclock/")) return reply(res, 404, "");
  if (sn !== SN) { log("ignored device", sn || "(none)"); return reply(res, 403, "unknown device"); }
  deviceSeen = new Date().toISOString();
  let raw = ""; req.on("data", (c) => { raw += c; if (raw.length > 2_000_000) req.destroy(); });
  req.on("end", async () => {
    try {
      if (u.pathname === "/iclock/cdata" && req.method === "GET") {
        // handshake: ask the device for attendance only (TransFlag), no templates/photos/user data
        return reply(res, 200, [`GET OPTION FROM: ${SN}`, "ATTLOGStamp=None", "OPERLOGStamp=9999", "ATTPHOTOStamp=None", "ErrorDelay=30", "Delay=10",
          "TransTimes=00:00;14:05", "TransInterval=1", "TransFlag=TransData AttLog", "TimeZone=3", "Realtime=1", "Encrypt=None", ""].join("\n"));
      }
      if (u.pathname === "/iclock/cdata" && req.method === "POST") {
        if ((u.searchParams.get("table") || "").toUpperCase() !== "ATTLOG") return reply(res, 200, "OK"); // discard everything else
        const rows = parseAttlog(raw);
        for (let i = 0; i < rows.length; i += 500) { const j = await send(rows.slice(i, i + 500)); log("sent", rows.slice(i, i + 500).length, JSON.stringify(j)); }
        return reply(res, 200, `OK: ${rows.length}`); // only after Rikaz accepted; otherwise the device resends later
      }
      if (u.pathname === "/iclock/getrequest") {
        if (Date.now() - lastBeat > 60_000) { lastBeat = Date.now(); send([]).catch((e) => log("heartbeat failed", e.message)); }
        return reply(res, 200, "OK");
      }
      return reply(res, 200, "OK");
    } catch (e) { log("error", e.message); return reply(res, 500, "ERROR"); }
  });
}).listen(PORT, () => log(`Rikaz ADMS bridge on port ${PORT} for device ${SN}`));
