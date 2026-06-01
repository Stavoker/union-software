import { Client as SshClient } from "ssh2";

export function shellSingleQuote(path) {
  return `'${String(path).replace(/'/g, `'\"'\"'`)}'`;
}

export function sshUsesSudo() {
  const v = String(process.env.SUBDOMAIN_HOST_SSH_USE_SUDO ?? process.env.SUBDOMAIN_HOST_NGINX_USE_SUDO ?? "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

export function sudoPrefix() {
  return sshUsesSudo() ? "sudo " : "";
}

export function sshExecCommand(host, user, password, command, port = 22, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH exec timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, { pty: false }, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            reject(err);
            return;
          }
          let stdout = "";
          let stderr = "";
          stream.on("data", (d) => {
            stdout += d.toString();
          });
          stream.stderr.on("data", (d) => {
            stderr += d.toString();
          });
          stream.on("close", (code) => {
            clearTimeout(timer);
            conn.end();
            if (code !== 0) {
              reject(new Error(`SSH exit ${code}: ${(stderr || stdout).trim().slice(0, 800)}`));
            } else {
              resolve({ stdout, stderr });
            }
          });
        });
      })
      .on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      })
      .connect({
        host,
        port: Number.isFinite(Number(port)) && Number(port) > 0 ? Number(port) : 22,
        username: user,
        password: String(password || ""),
        readyTimeout: 20000,
      });
  });
}
