import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const messages = Object.fromEntries(
  ["vi", "en"].map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(root, "public", "locales", `${locale}.json`), "utf8"))
  ])
);

export function languageMiddleware(req, _res, next) {
  const cookie = String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("sunnyfarm_lang="));
  const requested = cookie?.split("=")[1] || req.query.lang;
  req.language = requested === "en" ? "en" : "vi";
  next();
}

export function t(locale, key, values = {}) {
  const template = messages[locale]?.[key] ?? messages.vi[key] ?? key;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}
