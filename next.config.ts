import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
  env: { VERSIONE: process.env.VERCEL_GIT_COMMIT_SHA ?? "" },   // l'editor si accorge quando ne esce una nuova
};

export default config;
