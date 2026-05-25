import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 루트 .env 파일에서 key=value 파싱 */
function parseRootEnv() {
  try {
    const content = readFileSync(join(__dirname, "..", ".env"), "utf-8");
    const result = {};
    for (const line of content.split("\n")) {
      const m = line.match(/^([^#\s][^=]*)=(.*)$/);
      if (m) result[m[1].trim()] = m[2].trim();
    }
    return result;
  } catch {
    return {};
  }
}

const rootEnv = parseRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // 루트 .env의 NEXT_PUBLIC_THEME을 주입 (frontend/.env.local 보다 우선)
    NEXT_PUBLIC_THEME: rootEnv.NEXT_PUBLIC_THEME || "nanoBanana",
  },
};

export default nextConfig;
