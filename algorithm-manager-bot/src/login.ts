import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import puppeteer from "puppeteer-core";
import { BrowserLauncher } from "./infrastructure/connectors/live/BrowserLauncher.js";

async function runLogin() {
  const profileDir = BrowserLauncher.getProfileDir();
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const executablePath = BrowserLauncher.findSystemBrowserExecutable();
  const browserName = BrowserLauncher.getBrowserDisplayName(executablePath);
  BrowserLauncher.killOrphanedBotChrome();
  BrowserLauncher.cleanStaleLocks(profileDir);

  console.log("\n" + "=".repeat(70));
  console.log("   🔑 CONFIGURACIÓN DE CUENTA DE GOOGLE PARA EL BOT");
  console.log("=".repeat(70));
  console.log(" Google Meet requiere tener una sesión de Google abierta para poder");
  console.log(" unirse a reuniones creadas desde cuentas personales (@gmail.com).");
  console.log("");
  console.log(` 🌐 Abriendo ${browserName} en tu pantalla (${executablePath})...`);
  console.log(" 👉 Inicia sesión con cualquier cuenta de Google en la ventana que aparece.");
  console.log(" Solo se hace UNA vez; la sesión quedará guardada permanentemente.");
  console.log("=".repeat(70) + "\n");

  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    userDataDir: profileDir,
    args: [
      ...BrowserLauncher.getChromeArgs(),
      "--no-first-run",
      "--no-default-browser-check"
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    defaultViewport: null
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  await page.goto("https://accounts.google.com", { waitUntil: "domcontentloaded" });

  console.log(`✅ Ventana de ${browserName} abierta con éxito.`);
  console.log(`👉 Por favor ingresa tus datos en la ventana de ${browserName}.`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  await new Promise<void>((resolve) => {
    rl.question(`\n👉 Cuando hayas iniciado sesión en ${browserName}, presiona [ENTER] aquí: `, () => {
      rl.close();
      resolve();
    });
  });

  console.log("\nGuardando sesión del bot de forma segura...");

  try {
    const cookies = await page.cookies("https://accounts.google.com");
    const googleCookies = cookies.filter((c) => c.domain.includes("google.com"));
    if (googleCookies.length > 0) {
      console.log(`✅ ¡Verificado: Sesión de Google activa (${googleCookies.length} cookies detectadas)!`);
    } else {
      console.warn("⚠️ Advertencia: No se detectaron cookies de Google activas.");
    }
  } catch {}

  await browser.close().catch(() => {});
  BrowserLauncher.cleanStaleLocks(profileDir);

  console.log("✅ ¡Sesión de Google guardada con éxito en .bot-chrome-session!");
  console.log("Ahora puedes ejecutar 'npm run bot <url-de-meet>' y el bot entrará de inmediato.\n");
}

runLogin().catch((err) => {
  console.error("Error al configurar login:", err);
  process.exit(1);
});
