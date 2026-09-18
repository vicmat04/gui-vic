import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
              // Allow eval for pdfjs-dist worker + unpkg CDN for the worker script
              "script-src 'self' 'unsafe-eval' https://unpkg.com",
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
