#!/usr/bin/env node
// OAuth one-time authorization para backup a Drive.
//
// Uso:
//   node scripts/auth-oauth.mjs
//
// Pre-requisitos:
//   1. Crear un OAuth Client ID (tipo "Desktop app") en:
//      https://console.cloud.google.com/apis/credentials?project=imports-zona-norte
//   2. Descargar el JSON y guardarlo en .credentials/drive-oauth-client.json
//
// Este script:
//   - Levanta un server HTTP local en un puerto random (127.0.0.1)
//   - Abre el navegador con la URL de consent de Google
//   - Captura el code del callback
//   - Intercambia code por refresh_token
//   - Guarda credentials completas en .credentials/drive-oauth-token.json
//
// El backup.mjs usa ese token para autenticar automáticamente de ahí en más.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import http from "http";
import { exec } from "child_process";
import { google } from "googleapis";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const CLIENT_PATH = join(PROJECT_ROOT, ".credentials", "drive-oauth-client.json");
const TOKEN_PATH = join(PROJECT_ROOT, ".credentials", "drive-oauth-token.json");
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

async function main() {
  if (!existsSync(CLIENT_PATH)) {
    console.error(`❌ Falta el OAuth Client ID en: ${CLIENT_PATH}\n`);
    console.error("Pasos para crearlo:");
    console.error("1. Ir a https://console.cloud.google.com/apis/credentials?project=imports-zona-norte");
    console.error('2. "Create Credentials" → "OAuth client ID"');
    console.error('3. Si pide "Configure consent screen" primero: elegí External, tu propio email, publicá');
    console.error('4. Application type: "Desktop app"');
    console.error('5. Name: "IZN Backup Desktop"');
    console.error("6. Create → Download JSON");
    console.error(`7. mv ~/Downloads/client_secret_*.json ${CLIENT_PATH}`);
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(CLIENT_PATH, "utf8"));
  const creds = raw.installed || raw.web || raw;
  const { client_id, client_secret } = creds;
  if (!client_id || !client_secret) {
    console.error("❌ El JSON de OAuth Client no tiene client_id/client_secret válidos");
    process.exit(1);
  }

  // Server loopback: puerto random entre 4000-4999
  const port = 4000 + Math.floor(Math.random() * 1000);
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent", // fuerza emisión de refresh_token
  });

  console.log("\n🔐 Autorización OAuth — Drive Backup\n");
  console.log("Se va a abrir el navegador. Autorizá la app con tu cuenta dcontro20@gmail.com.");
  console.log("Si el browser dice 'App not verified' → click en 'Advanced' → 'Go to IZN Backup (unsafe)'.");
  console.log("(No es inseguro, es porque es una app privada sin verificación pública.)\n");
  console.log(`Si el browser no se abre automáticamente, pegá esto:\n${authUrl}\n`);

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404); res.end("Not found"); return;
      }
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      if (err) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body style="font-family:sans-serif;padding:40px"><h1>❌ Error: ${err}</h1><p>Podés cerrar esta ventana.</p></body></html>`);
        console.error(`❌ Error de autorización: ${err}`);
        server.close();
        process.exit(1);
      }
      if (!code) {
        res.writeHead(400); res.end("Missing code"); return;
      }

      const { tokens } = await oauth2.getToken(code);
      writeFileSync(TOKEN_PATH, JSON.stringify({
        client_id, client_secret,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
      }, null, 2));

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body style="font-family:sans-serif;padding:40px;max-width:500px;margin:auto;text-align:center">
<h1 style="color:#0F7B6C">✅ Autorización OK</h1>
<p>Credenciales guardadas. Ya podés cerrar esta ventana.</p>
<p style="color:#8C8A82;font-size:14px">El backup diario se va a subir automáticamente a tu carpeta de Drive.</p>
</body></html>`);

      console.log(`\n✅ Token guardado en: ${TOKEN_PATH}`);
      if (!tokens.refresh_token) {
        console.warn("\n⚠️  No recibimos refresh_token. Reintentá con prompt=consent (ya está activado).");
        console.warn("    Si sigue fallando, revocá el acceso en https://myaccount.google.com/permissions y repetí.");
      } else {
        console.log("   Refresh token obtenido → el backup automático ya puede correr sin intervención.");
      }
      console.log("\n🎯 Ahora probá:  node scripts/backup.mjs --upload\n");
      server.close();
      process.exit(0);
    } catch (e) {
      console.error("❌ Error en callback:", e.message);
      res.writeHead(500); res.end("Error");
      server.close();
      process.exit(1);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`🌐 Escuchando callback en http://127.0.0.1:${port}/callback ...\n`);
    // Abrir browser (macOS)
    exec(`open "${authUrl}"`, (err) => {
      if (err) console.log("   (abrí el link a mano si el navegador no apareció)");
    });
  });
}

main().catch(err => {
  console.error("❌", err.message);
  process.exit(1);
});
