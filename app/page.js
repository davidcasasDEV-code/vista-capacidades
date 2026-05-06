import fs from "node:fs";
import path from "node:path";
import Script from "next/script";

export const dynamic = "force-dynamic";

function getBodyHtml() {
  const htmlPath = path.join(process.cwd(), "public", "index.html");
  const html = fs.readFileSync(htmlPath, "utf8");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return body
    .replace(/<script\s+src=["']\/app\.js["']><\/script>/gi, "")
    .replace(/<link\s+rel=["']stylesheet["']\s+href=["']\/styles\.css["']\s*\/?>(\s*)/gi, "");
}

export default function HomePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: getBodyHtml() }} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
