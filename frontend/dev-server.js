const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const adminRoutes = {
  "/admin": "/admin/index.html",
  "/admin/login": "/admin/index.html",
  "/admin/register": "/admin/register.html",
  "/admin/dashboard": "/admin/dashboard.html",
  "/admin/students": "/admin/students.html",
  "/admin/skills": "/admin/skills.html",
  "/admin/exchanges": "/admin/exchanges.html",
  "/admin/notifications": "/admin/notifications.html",
  "/admin/profile": "/admin/profile.html",
  "/admin/mfa-setup": "/admin/mfa-setup.html"
};
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendText(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return sendText(res, 405, "Method not allowed");
  }

  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return sendText(res, 400, "Bad request");
  }
  requestPath = requestPath.replace(/\/+$/, "") || "/";

  let relativePath = adminRoutes[requestPath];
  if (!relativePath) {
    relativePath = requestPath === "/" || !path.extname(requestPath)
      ? "/index.html"
      : requestPath;
  }

  const filePath = path.resolve(root, `.${relativePath}`);
  const relativeToRoot = path.relative(root, filePath);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return sendText(res, 403, "Forbidden");
  }

  fs.stat(filePath, (statError, fileInfo) => {
    if (statError || !fileInfo.isFile()) return sendText(res, 404, "The requested path could not be found");
    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": fileInfo.size
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen({ port, host: "::", ipv6Only: false }, () => {
  console.log(`SkillSwap frontend available at http://localhost:${port}`);
});
