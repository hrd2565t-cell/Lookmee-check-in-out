// สคริปต์ตรวจสอบความปลอดภัย ป้องกัน KEY API และความลับรั่วไหล (Secret Scanner)
// รันตรวจสอบได้ทุกเมื่อด้วยคำสั่ง: node scripts/check-secrets.mjs
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

console.log("🔒 เริ่มต้นตรวจสอบความปลอดภัยและตรวจจับการรั่วไหลของ API Keys...\n");

let hasErrors = false;

// 1. ตรวจสอบว่ามีไฟล์ .env หรือ .env.local หลุดไปอยู่ใน Git tracking หรือไม่
try {
  const trackedEnv = execSync("git ls-files .env*", { encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== ".env.example");

  if (trackedEnv.length > 0) {
    console.error("❌ พบไฟล์ Environment ที่มีความลับถูก Track อยู่ใน Git:");
    trackedEnv.forEach((f) => console.error(`   - ${f}`));
    console.error("   → ดำเนินการแก้ไขด้วย: git rm --cached <file>\n");
    hasErrors = true;
  } else {
    console.log("✓ ไม่พบไฟล์ .env หรือ .env.local อยู่ใน Git index (ปลอดภัย)");
  }
} catch (e) {
  console.warn("⚠️ ไม่สามารถรันคำสั่ง git ls-files ได้:", e.message);
}

// 2. ตรวจสอบ .gitignore ว่าครอบคลุมไฟล์ .env ทั้งหมดหรือไม่
if (existsSync(".gitignore")) {
  const gitignore = readFileSync(".gitignore", "utf8");
  const hasEnvPattern = gitignore.includes(".env") && gitignore.includes(".env.*");
  if (!hasEnvPattern) {
    console.error("❌ .gitignore ยังไม่ครอบคลุม .env หรือ .env.* ทั้งหมด");
    hasErrors = true;
  } else {
    console.log("✓ .gitignore มีการป้องกันไฟล์ .env และ .env.* ครบถ้วน (ปลอดภัย)");
  }
} else {
  console.error("❌ ไม่พบไฟล์ .gitignore");
  hasErrors = true;
}

// 3. ตรวจสอบไฟล์ที่อยู่ใน Git ว่ามีการเผลอฮาร์ดโค้ด Key หรือ Token ต้องห้ามหรือไม่
const RISK_PATTERNS = [
  { name: "Supabase Personal Access Token (sbp_...)", regex: /sbp_[a-zA-Z0-9]{20,}/g },
  { name: "Supabase Secret Role Key (sb_secret_...)", regex: /sb_secret_[a-zA-Z0-9]{15,}/g },
  { name: "OpenAI / Claude Secret Key (sk-...)", regex: /sk-[a-zA-Z0-9]{25,}/g },
  { name: "Google API Key (AIzaSy...)", regex: /AIzaSy[a-zA-Z0-9_-]{30,}/g },
  { name: "Private Key Block", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

try {
  const trackedFiles = execSync("git ls-files", { encoding: "utf8" })
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let leakFound = false;
  for (const file of trackedFiles) {
    // ข้ามไฟล์ binary และรูปภาพ
    if (/\.(jpg|jpeg|png|ico|bin|webp|svg|pdf)$/i.test(file)) continue;
    if (!existsSync(file)) continue;

    const content = readFileSync(file, "utf8");
    for (const pat of RISK_PATTERNS) {
      if (pat.regex.test(content)) {
        console.error(`❌ ตรวจพบรูปแบบ ${pat.name} ในไฟล์: ${file}`);
        leakFound = true;
      }
    }
  }

  if (leakFound) {
    hasErrors = true;
  } else {
    console.log("✓ ไม่พบ API Key หรือ Private Token ต้องห้ามใน Source Code ทั้งหมด (ปลอดภัย)");
  }
} catch (e) {
  console.warn("⚠️ ไม่สามารถสแกนเนื้อหาไฟล์ใน Git ได้:", e.message);
}

console.log("\n------------------------------------------------------------");
if (hasErrors) {
  console.error("🚨 ตรวจพบความเสี่ยงด้านความปลอดภัย กรุณาแก้ไขก่อน Commit หรือ Push!");
  process.exit(1);
} else {
  console.log("🎉 ผ่านการตรวจสอบความปลอดภัย 100% ไม่มี API Key หรือความลับรั่วไหล");
  process.exit(0);
}
