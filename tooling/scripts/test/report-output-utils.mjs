import { stripVTControlCharacters } from "node:util";
import path from "node:path";

const vitestScriptNames = new Set(["test:backend", "test:ci", "test:unit"]);

function mojibakeScore(text) {
  return (text.match(/[Ãâ�]/g) ?? []).length;
}

export function sanitizeCapturedText(text) {
  const stripped = stripVTControlCharacters(text ?? "");
  if (!stripped || !/[Ãâ�]/.test(stripped)) {
    return stripped;
  }

  const repaired = Buffer.from(stripped, "latin1").toString("utf8");
  return mojibakeScore(repaired) < mojibakeScore(stripped)
    ? repaired
    : stripped;
}

export function sanitizeFileSegment(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

export function isVitestCommandStep(step) {
  return (
    step?.command === "npm" &&
    Array.isArray(step?.args) &&
    step.args[0] === "run" &&
    vitestScriptNames.has(step.args[1] ?? "")
  );
}

export function getVitestMarkdownOutputPath(runDir, index, step) {
  if (!isVitestCommandStep(step)) {
    return null;
  }

  const baseName = `${String(index).padStart(2, "0")}-${sanitizeFileSegment(step.id)}`;
  return path.join(runDir, `${baseName}.vitest.md`);
}

export function getVitestReporterEnv(outputFile, runLabel = null) {
  if (!outputFile) {
    return {};
  }

  return {
    VITEST_MARKDOWN: "1",
    VITEST_MARKDOWN_APPEND: "1",
    VITEST_MARKDOWN_OUTPUT_FILE: outputFile,
    ...(runLabel ? { VITEST_MARKDOWN_RUN_LABEL: runLabel } : {}),
  };
}
