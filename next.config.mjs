/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.pinimg.com',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    if (isServer) {
      config.externals = [...(config.externals || []), 'onnxruntime-web', 'onnxruntime-web/webgl'];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // ── DNS & Transport Security ────────────────────────────────
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },

          // ── Clickjacking & MIME Protection ──────────────────────────
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },

          // ── Referrer & Permissions Policy ───────────────────────────
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(self), payment=()",
          },

          // ── Cross-Origin Isolation (Cloudflare Security Audit) ──────
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },

          // ── Content Security Policy ─────────────────────────────────
          // Restricts which resources can be loaded, preventing XSS attacks
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://accounts.google.com https://apis.google.com https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://translate.google.com https://translate.googleapis.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://translate.googleapis.com https://www.gstatic.com https://maps.googleapis.com",
              "img-src 'self' data: blob: https: http: https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.cartocdn.com https://*.tile.openstreetmap.org https://*.openstreetmap.org https://translate.googleapis.com https://www.gstatic.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com https://oauth2.googleapis.com https://maps.googleapis.com https://*.googleapis.com https://*.google.com https://*.gstatic.com https://*.cartocdn.com https://router.project-osrm.org https://routing.openstreetmap.de https://translate.googleapis.com https://*.vercel.app https://*.upstash.io https://www.google.com/recaptcha/",
              "worker-src 'self' blob:",
              "frame-src 'self' https://accounts.google.com https://www.google.com/recaptcha/",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/admin/staff",
        destination: "/admin/users",
        permanent: true,
      },
      {
        source: "/transport-admin/system/staff",
        destination: "/transport-admin/system/users",
        permanent: true,
      },
      {
        source: "/transport-manager/buses/:path*",
        destination: "/transport-admin/buses/:path*",
        permanent: true,
      },
      {
        source: "/transport-manager/buses",
        destination: "/transport-admin/buses",
        permanent: true,
      },
      {
        source: "/transport-manager/routes/:path*",
        destination: "/transport-admin/routes/:path*",
        permanent: true,
      },
      {
        source: "/transport-manager/routes",
        destination: "/transport-admin/routes",
        permanent: true,
      },
      {
        source: "/staff/:path*",
        destination: "/transport-admin/:path*",
        permanent: true,
      },
      {
        source: "/staff",
        destination: "/transport-admin",
        permanent: true,
      },
      {
        source: "/transport-head/:path*",
        destination: "/transport-manager/:path*",
        permanent: true,
      },
      {
        source: "/transport-head",
        destination: "/transport-manager",
        permanent: true,
      },
      {
        source: "/track",
        destination: "/portal",
        permanent: true,
      },
      {
        source: "/radar",
        destination: "/portal",
        permanent: true,
      },
      {
        source: "/transport",
        destination: "/transport-manager",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
