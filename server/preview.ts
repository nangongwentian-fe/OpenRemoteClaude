import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { PREVIEW_SESSION_COOKIE } from "./auth-cookie";

export function createPreviewRoutes(jwtSecret: string) {
  const app = new Hono();

  // JWT 认证
  app.use(
    "/*",
    jwt({
      secret: jwtSecret,
      alg: "HS256",
      cookie: PREVIEW_SESSION_COOKIE,
    })
  );

  // 反向代理：转发到 localhost:<port>
  app.all("/:port{[0-9]+}/*", async (c) => {
    const port = c.req.param("port");
    const portNum = parseInt(port, 10);
    if (portNum <= 0 || portNum > 65535) {
      return c.text("Invalid port", 400);
    }

    // 构建目标 URL
    const url = new URL(c.req.url);
    const pathPrefix = `/api/preview/${port}`;
    const targetPath = url.pathname.startsWith(pathPrefix)
      ? url.pathname.slice(pathPrefix.length) || "/"
      : "/";
    const targetUrl = `http://localhost:${port}${targetPath}${url.search}`;

    try {
      // 转发请求
      const headers = new Headers(c.req.raw.headers);
      headers.delete("host");
      headers.delete("origin");
      // 移除认证头（JWT token 不应转发给目标服务）
      headers.delete("authorization");

      const response = await fetch(targetUrl, {
        method: c.req.method,
        headers,
        body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
        redirect: "manual",
      });

      // 复制响应头
      const responseHeaders = new Headers(response.headers);
      // 移除可能冲突的头
      responseHeaders.delete("transfer-encoding");

      const contentType = responseHeaders.get("content-type") || "";

      // HTML 响应注入 <base> 标签
      if (contentType.includes("text/html")) {
        let html = await response.text();
        const baseTag = `<base href="/api/preview/${port}/">`;
        if (html.includes("<head>")) {
          html = html.replace("<head>", `<head>${baseTag}`);
        } else if (html.includes("<HEAD>")) {
          html = html.replace("<HEAD>", `<HEAD>${baseTag}`);
        } else {
          html = baseTag + html;
        }
        return new Response(html, {
          status: response.status,
          headers: responseHeaders,
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Proxy error";
      if (message.includes("ECONNREFUSED")) {
        return c.text(`No server running on port ${port}`, 502);
      }
      return c.text(message, 502);
    }
  });

  // 无路径时重定向到 /
  app.get("/:port{[0-9]+}", (c) => {
    const port = c.req.param("port");
    return c.redirect(`/api/preview/${port}/`);
  });

  return app;
}
