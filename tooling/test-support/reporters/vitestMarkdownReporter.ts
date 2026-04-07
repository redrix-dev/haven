import fs from 'node:fs';
import path from 'node:path';
import type {
  Reporter,
  TestCase,
  TestModule,
  TestRunEndReason,
} from 'vitest/node';

type MarkdownReporterOptions = {
  append?: boolean;
  outputFile?: string;
  runLabel?: string | null;
};

type TestCounts = {
  failed: number;
  passed: number;
  skipped: number;
};

const formatDuration = (durationMs: number | undefined) => {
  if (!Number.isFinite(durationMs) || durationMs === undefined || durationMs < 1) {
    return '0ms';
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`;
};

const getStateIcon = (state: string) => {
  switch (state) {
    case 'passed':
      return '✅';
    case 'failed':
      return '❌';
    case 'skipped':
      return '⏭️';
    case 'queued':
    case 'pending':
      return '⏳';
    default:
      return '•';
  }
};

const getStatusLabel = (reason: TestRunEndReason, hasFailures: boolean) => {
  if (hasFailures) return 'FAILED';
  if (reason === 'interrupted') return 'INTERRUPTED';
  return 'PASSED';
};

const sanitizeFence = (text: string) => text.replace(/\u0000/g, '').trim();

const formatUnknownError = (error: unknown): string => {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    return [error.message, error.stack].filter(Boolean).join('\n');
  }
  if (typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      name?: unknown;
      stack?: unknown;
      stackStr?: unknown;
      cause?: unknown;
    };
    const message =
      typeof candidate.message === 'string'
        ? candidate.message
        : typeof candidate.name === 'string'
          ? candidate.name
          : null;
    const stack =
      typeof candidate.stack === 'string'
        ? candidate.stack
        : typeof candidate.stackStr === 'string'
          ? candidate.stackStr
          : null;
    const cause: string | null =
      candidate.cause && typeof candidate.cause === 'object'
        ? formatUnknownError(candidate.cause)
        : null;
    const combined: string = [message, stack, cause].filter(Boolean).join('\n');
    if (combined) return combined;
  }
  return String(error);
};

const collectTests = (testModule: TestModule) =>
  Array.from(testModule.children.allTests());

const countTests = (tests: readonly TestCase[]): TestCounts => {
  const counts: TestCounts = { passed: 0, failed: 0, skipped: 0 };

  for (const testCase of tests) {
    const state = testCase.result().state;
    if (state === 'passed') counts.passed += 1;
    else if (state === 'failed') counts.failed += 1;
    else if (state === 'skipped') counts.skipped += 1;
  }

  return counts;
};

const countFiles = (testModules: readonly TestModule[]) => {
  const counts: TestCounts = { passed: 0, failed: 0, skipped: 0 };

  for (const testModule of testModules) {
    const state = testModule.state();
    if (state === 'passed') counts.passed += 1;
    else if (state === 'failed') counts.failed += 1;
    else if (state === 'skipped') counts.skipped += 1;
  }

  return counts;
};

const buildMarkdownReport = (input: {
  headingLevel: 1 | 2;
  options: MarkdownReporterOptions;
  reason: TestRunEndReason;
  testModules: readonly TestModule[];
  unhandledErrors: readonly unknown[];
}) => {
  const { headingLevel, options, reason, testModules, unhandledErrors } = input;
  const fileCounts = countFiles(testModules);
  const allTests = testModules.flatMap(collectTests);
  const testCounts = countTests(allTests);
  const hasFailures = fileCounts.failed > 0 || testCounts.failed > 0 || unhandledErrors.length > 0;
  const status = getStatusLabel(reason, hasFailures);
  const statusIcon = getStateIcon(hasFailures ? 'failed' : reason === 'interrupted' ? 'pending' : 'passed');
  const headingPrefix = '#'.repeat(headingLevel);
  const title = options.runLabel?.trim() || 'Vitest Markdown Report';

  const lines: string[] = [];
  lines.push(`${headingPrefix} ${title}`);
  lines.push('');
  lines.push(`- **Status:** ${statusIcon} **${status}**`);
  lines.push(`- **Reason:** \`${reason}\``);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push(
    `- **Files:** ✅ ${fileCounts.passed} passed, ❌ ${fileCounts.failed} failed, ⏭️ ${fileCounts.skipped} skipped`
  );
  lines.push(
    `- **Tests:** ✅ ${testCounts.passed} passed, ❌ ${testCounts.failed} failed, ⏭️ ${testCounts.skipped} skipped`
  );
  lines.push('');

  if (testModules.length === 0) {
    lines.push('_No test modules were reported._');
    lines.push('');
  }

  for (const testModule of testModules) {
    const tests = collectTests(testModule);
    const counts = countTests(tests);
    const fileState = testModule.state();
    const moduleErrors = testModule.errors();

    lines.push(`### ${getStateIcon(fileState)} \`${testModule.relativeModuleId}\``);
    lines.push('');
    lines.push(`- **State:** ${fileState}`);
    lines.push(`- **Duration:** ${formatDuration(testModule.diagnostic().duration)}`);
    lines.push(
      `- **Tests:** ✅ ${counts.passed} passed, ❌ ${counts.failed} failed, ⏭️ ${counts.skipped} skipped`
    );

    if (moduleErrors.length > 0) {
      lines.push('');
      lines.push('#### Collection Errors');
      lines.push('');
      for (const error of moduleErrors) {
        lines.push('```text');
        lines.push(sanitizeFence(formatUnknownError(error)));
        lines.push('```');
        lines.push('');
      }
    }

    if (tests.length > 0) {
      lines.push('');
      lines.push('#### Test Cases');
      lines.push('');
      for (const testCase of tests) {
        const result = testCase.result();
        const duration = testCase.diagnostic()?.duration;
        const durationLabel = duration !== undefined ? ` _${formatDuration(duration)}_` : '';
        const skipNote =
          result.state === 'skipped' && result.note ? ` - ${result.note}` : '';

        lines.push(
          `- ${getStateIcon(result.state)} \`${testCase.fullName}\`${durationLabel}${skipNote}`
        );

        if (result.state === 'failed' && result.errors.length > 0) {
          for (const error of result.errors) {
            lines.push('');
            lines.push('  ```text');
            lines.push(`  ${sanitizeFence(formatUnknownError(error)).replace(/\r?\n/g, '\n  ')}`);
            lines.push('  ```');
          }
        }
      }
      lines.push('');
    }
  }

  if (unhandledErrors.length > 0) {
    lines.push('### Unhandled Errors');
    lines.push('');
    for (const error of unhandledErrors) {
      lines.push('```text');
      lines.push(sanitizeFence(formatUnknownError(error)));
      lines.push('```');
      lines.push('');
    }
  }

  return `${lines.join('\n').trim()}\n`;
};

export default class VitestMarkdownReporter implements Reporter {
  private readonly options: MarkdownReporterOptions;

  constructor(options: MarkdownReporterOptions = {}) {
    this.options = options;
  }

  async onTestRunEnd(
    testModules: readonly TestModule[],
    unhandledErrors: readonly unknown[],
    reason: TestRunEndReason
  ) {
    const outputFile = path.resolve(
      process.cwd(),
      this.options.outputFile?.trim() || './test-results.md'
    );
    const append = this.options.append === true;
    const shouldAppend = append && fs.existsSync(outputFile) && fs.statSync(outputFile).size > 0;
    const report = buildMarkdownReport({
      headingLevel: shouldAppend ? 2 : 1,
      options: this.options,
      reason,
      testModules,
      unhandledErrors,
    });

    fs.mkdirSync(path.dirname(outputFile), { recursive: true });

    if (shouldAppend) {
      fs.appendFileSync(outputFile, `\n\n---\n\n${report}`, 'utf8');
      return;
    }

    fs.writeFileSync(outputFile, report, 'utf8');
  }
}
