import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDesktop = path.resolve(__dirname, "..");

// Determinar plataforma objetivo
let targetPlatform = process.platform;
const args = process.argv.slice(2);
const platformArgIdx = args.indexOf("--platform");
if (platformArgIdx !== -1 && args[platformArgIdx + 1]) {
  targetPlatform = args[platformArgIdx + 1];
}

if (!["win32", "linux"].includes(targetPlatform)) {
  console.error(`Plataforma no soportada: ${targetPlatform}. Usa --platform win32 o --platform linux.`);
  process.exit(1);
}

const WHISPER_RELEASE = "b5454";
const targetBinDir = path.join(rootDesktop, "resources/bin", targetPlatform);

async function downloadFile(url, destPath) {
  console.log(`[fetch-binaries] Descargando desde ${url}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error HTTP al descargar ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fsp.writeFile(destPath, Buffer.from(arrayBuffer));
  console.log(`[fetch-binaries] Descarga completada: ${destPath}`);
}

async function findFilesRecursively(dir, filterFn) {
  let results = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await findFilesRecursively(fullPath, filterFn));
    } else if (filterFn(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function run() {
  console.log(`[fetch-binaries] Preparando binarios para plataforma: ${targetPlatform}`);

  // Asegurar directorio limpio y nuevo
  if (fs.existsSync(targetBinDir)) {
    await fsp.rm(targetBinDir, { recursive: true, force: true });
  }
  await fsp.mkdir(targetBinDir, { recursive: true });

  const tempExtractDir = path.join(rootDesktop, "resources/bin", `.temp-extract-${targetPlatform}`);
  if (fs.existsSync(tempExtractDir)) {
    await fsp.rm(tempExtractDir, { recursive: true, force: true });
  }
  await fsp.mkdir(tempExtractDir, { recursive: true });

  try {
    const isWin = targetPlatform === "win32";

    // 1. whisper.cpp. Si WHISPER_BUILD_DIR apunta a una compilación propia (p. ej. con soporte de GPU
    // Vulkan, ver scripts/build-whisper-vulkan.bat), se usa esa en lugar del release oficial solo-CPU.
    const customBuildDir = process.env.WHISPER_BUILD_DIR;
    if (customBuildDir) {
      const cliName = isWin ? "whisper-cli.exe" : "whisper-cli";
      if (!fs.existsSync(path.join(customBuildDir, cliName))) {
        throw new Error(`WHISPER_BUILD_DIR no contiene ${cliName}: ${customBuildDir}`);
      }
      for (const entry of await fsp.readdir(customBuildDir)) {
        const lower = entry.toLowerCase();
        if (entry === cliName || lower.endsWith(".dll") || lower.endsWith(".so") || lower.includes(".so.")) {
          await fsp.copyFile(path.join(customBuildDir, entry), path.join(targetBinDir, entry));
        }
      }
      console.log(`[fetch-binaries] whisper.cpp copiado desde la compilación propia: ${customBuildDir}`);
    } else {
    // 1b. whisper.cpp ${WHISPER_RELEASE} (release oficial, solo CPU)
    const archiveName = isWin ? "whisper-bin-x64.zip" : "whisper-bin-ubuntu-x64.tar.gz";
    const archiveUrl = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_RELEASE}/${archiveName}`;
    const archivePath = path.join(tempExtractDir, archiveName);

    await downloadFile(archiveUrl, archivePath);

    console.log(`[fetch-binaries] Extrayendo ${archiveName}...`);
    if (isWin) {
      execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${tempExtractDir}' -Force"`, {
        stdio: "inherit"
      });
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${tempExtractDir}"`, {
        stdio: "inherit"
      });
    }

    // Localizar whisper-cli / whisper-cli.exe y librerías dinámicas
    const cliExecutableName = isWin ? "whisper-cli.exe" : "whisper-cli";
    const foundCli = await findFilesRecursively(tempExtractDir, (name) => name.toLowerCase() === cliExecutableName.toLowerCase());

    if (foundCli.length === 0) {
      throw new Error(`No se pudo encontrar el ejecutable '${cliExecutableName}' en el archivo extraído.`);
    }

    const cliSourcePath = foundCli[0];
    const cliDestPath = path.join(targetBinDir, cliExecutableName);
    await fsp.copyFile(cliSourcePath, cliDestPath);

    // Copiar cualquier DLL o .so adyacente
    const dynLibs = await findFilesRecursively(tempExtractDir, (name) => {
      const lower = name.toLowerCase();
      return lower.endsWith(".dll") || lower.endsWith(".so") || lower.includes(".so.");
    });

    for (const libPath of dynLibs) {
      const destLib = path.join(targetBinDir, path.basename(libPath));
      await fsp.copyFile(libPath, destLib);
    }

    }

    // 2. ffmpeg y ffprobe de paquetes estáticos si coincide plataforma
    try {
      const ffmpegStatic = await import("ffmpeg-static");
      const ffprobeStatic = await import("ffprobe-static");

      const ffmpegSrc = ffmpegStatic.default || ffmpegStatic;
      const ffprobeSrc = ffprobeStatic.default?.path || ffprobeStatic.path;

      if (ffmpegSrc && fs.existsSync(ffmpegSrc)) {
        const destFfmpeg = path.join(targetBinDir, isWin ? "ffmpeg.exe" : "ffmpeg");
        await fsp.copyFile(ffmpegSrc, destFfmpeg);
        console.log(`[fetch-binaries] Copiado ffmpeg desde ffmpeg-static: ${destFfmpeg}`);
      }

      if (ffprobeSrc && fs.existsSync(ffprobeSrc)) {
        const destFfprobe = path.join(targetBinDir, isWin ? "ffprobe.exe" : "ffprobe");
        await fsp.copyFile(ffprobeSrc, destFfprobe);
        console.log(`[fetch-binaries] Copiado ffprobe desde ffprobe-static: ${destFfprobe}`);
      }
    } catch (staticErr) {
      console.warn("[fetch-binaries] Advertencia al copiar ffmpeg/ffprobe estáticos:", staticErr.message);
    }

    // 2b. Modelo VAD (Silero, ~0.9 MB): permite a whisper.cpp saltar silencios y ruido
    const vadUrl = "https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin";
    const vadDest = path.join(targetBinDir, "ggml-silero-v5.1.2.bin");
    await downloadFile(vadUrl, vadDest);
    const vadSize = (await fsp.stat(vadDest)).size;
    if (vadSize < 500_000) {
      throw new Error(`Modelo VAD descargado con tamaño sospechoso (${vadSize} bytes).`);
    }

    // 3. Permisos de ejecución en Linux
    if (!isWin) {
      const allFiles = await fsp.readdir(targetBinDir);
      for (const file of allFiles) {
        await fsp.chmod(path.join(targetBinDir, file), 0o755);
      }
    }

    // 4. Verificación final de tamaño
    const statCli = await fsp.stat(path.join(targetBinDir, isWin ? "whisper-cli.exe" : "whisper-cli"));
    if (statCli.size === 0) {
      throw new Error("El ejecutable de whisper-cli tiene tamaño 0.");
    }

    console.log(`[fetch-binaries] Binarios preparados exitosamente en: ${targetBinDir}`);
  } finally {
    await fsp.rm(tempExtractDir, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch((err) => {
  console.error("[fetch-binaries] Error fatal:", err.message);
  process.exit(1);
});
