import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "basic-ftp";
import SftpClient from "ssh2-sftp-client";
import { getProjectPath } from "@/src/lib/project-service";

export async function deployProject({
  projectName,
  protocol,
  host,
  port,
  user,
  password,
  remoteDir,
}) {
  const localPath = await getProjectPath(projectName);
  await fs.access(localPath);
  if (protocol === "sftp") {
    return deployViaSftp({
      localPath,
      projectName,
      host,
      port,
      user,
      password,
      remoteDir,
    });
  }

  const client = new Client(60000);
  const secure = protocol === "ftps";
  const uploadLog = [];

  client.trackProgress((info) => {
    if (!info.name) return;
    uploadLog.push(
      `${info.type} ${info.name} (${Math.round(info.bytesOverall / 1024)} KB)`
    );
  });

  try {
    await client.access({
      host,
      port: Number(port || (secure ? 21 : 21)),
      user,
      password,
      secure,
    });

    const remotePath = normalizeRemoteDir(remoteDir, projectName);
    await client.ensureDir(remotePath);
    await client.clearWorkingDir();
    await client.uploadFromDir(localPath);
    await client.close();

    return {
      ok: true,
      remotePath,
      projectName,
      log: trimLog(uploadLog),
    };
  } catch (error) {
    try {
      client.close();
    } catch {}
    const msg = String(error?.message || "Неизвестная ошибка FTP");
    if (msg.includes("ECONNREFUSED")) {
      throw new Error(
        `Ошибка деплоя: сервер отказал в соединении (${host}:${Number(
          port || (secure ? 21 : 21)
        )}, ${secure ? "FTPS" : "FTP"}). Проверьте: 1) правильный порт/протокол, 2) открыт ли порт на хостинге, 3) не блокирует ли firewall/white-list ваш IP.`
      );
    }
    if (msg.includes("ETIMEDOUT")) {
      throw new Error(
        `Ошибка деплоя: таймаут подключения к ${host}. Проверьте доступность хоста, порт и сетевые ограничения.`
      );
    }
    throw new Error(`Ошибка деплоя: ${msg}`);
  }
}

async function deployViaSftp({
  localPath,
  projectName,
  host,
  port,
  user,
  password,
  remoteDir,
}) {
  const client = new SftpClient();
  const remotePath = normalizeRemoteDir(remoteDir, projectName);
  const log = [];
  try {
    await client.connect({
      host,
      port: Number(port || 22),
      username: user,
      password,
      readyTimeout: 60000,
    });

    await client.mkdir(remotePath, true);
    await client.uploadDir(localPath, remotePath);
    log.push(`uploadDir ${localPath} -> ${remotePath}`);
    await client.end();
    return {
      ok: true,
      remotePath,
      projectName,
      protocol: "sftp",
      log: trimLog(log),
    };
  } catch (error) {
    try {
      await client.end();
    } catch {}
    const msg = String(error?.message || "Неизвестная ошибка SFTP");
    if (msg.includes("Timed out") || msg.includes("ETIMEDOUT")) {
      throw new Error(
        `Ошибка деплоя: таймаут SFTP подключения к ${host}:${Number(
          port || 22
        )}. Проверьте порт 22, доступ по SSH и firewall/white-list.`
      );
    }
    if (msg.includes("All configured authentication methods failed")) {
      throw new Error(
        "Ошибка деплоя: неверный логин/пароль для SFTP (SSH аутентификация не прошла)."
      );
    }
    throw new Error(`Ошибка деплоя: ${msg}`);
  }
}

function normalizeRemoteDir(remoteDir, projectName) {
  const clean = String(remoteDir || "").trim();
  const base = clean ? (clean.startsWith("/") ? clean : `/${clean}`) : "/";
  const trimmedBase = base.replace(/\/+$/, "") || "/";
  const projectSegment = String(projectName || "").trim().replace(/^\/+|\/+$/g, "");

  // Если пользователь уже указал путь, который заканчивается именем проекта,
  // не дублируем сегмент.
  if (trimmedBase !== "/" && trimmedBase.endsWith(`/${projectSegment}`)) {
    return trimmedBase;
  }
  if (trimmedBase === "/") {
    return `/${projectSegment}`;
  }
  return `${trimmedBase}/${projectSegment}`;
}

function trimLog(lines) {
  if (lines.length <= 120) return lines.join("\n");
  return lines.slice(lines.length - 120).join("\n");
}
