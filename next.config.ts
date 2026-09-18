import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // pdfjs-dist requires eval() in its worker for PDF rendering.
            // unsafe-eval is scoped only to scripts; other directives stay strict.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js (App Router) requiere 'unsafe-inline' en producción para sus scripts de hidratación,
              // a menos que se implemente un Middleware con nonces criptográficos estrictos.
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              // Groq + Notion API calls from the server (API routes)
              "connect-src 'self' https://api.groq.com https://api.notion.com https://unpkg.com",
              "worker-src 'self' blob: https://unpkg.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
