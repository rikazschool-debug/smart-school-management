# Rikaz ADMS bridge (ZKTeco)

ZKTeco devices in ADMS mode push over plain HTTP; Rikaz only accepts HTTPS with a signed request.
This bridge sits between them: it forwards attendance rows only (user number + time), signed with the device link key.

## Where to run it
- A Windows/Linux PC that is always on, in the same network as the device (simplest), or
- a small cloud server with a public IP (then open the port in its firewall).

## Steps
1. Install Node.js 18+ (nodejs.org).
2. Copy `adms-bridge.mjs` to the computer.
3. In Rikaz → HR → Attendance → Shifts & settings → device: choose the school, enter the serial number, press «مفتاح ربط جديد», copy the device id and key.
4. Start it (Windows PowerShell):
   ```
   $env:RIKAZ_URL="https://kalmalki.lovable.app"; $env:DEVICE_ID="..."; $env:DEVICE_SECRET="..."; $env:DEVICE_SN="..."; node adms-bridge.mjs
   ```
   Linux: `RIKAZ_URL=... DEVICE_ID=... DEVICE_SECRET=... DEVICE_SN=... node adms-bridge.mjs` (use pm2/systemd to keep it running).
5. On the device: Comm → Cloud Server Setting:
   - Server Address: the bridge computer's IP (e.g. 192.168.1.50; fix it in the router)
   - Server Port: 8081
   - Enable Domain Name: OFF (ON only if you enter a domain name instead of an IP)
   - HTTPS / Proxy: OFF
6. Allow port 8081 in the computer's firewall. Rikaz shows «آخر اتصال بالجهاز» within a minute.
