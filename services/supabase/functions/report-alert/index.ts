import { jsonResponse, okOptionsResponse, parseJsonBody } from '../_shared/common.ts';

type ReportAlertRequest = {
  reportId?: unknown;
  reportType?: unknown;
  reporterUsername?: unknown;
  serverName?: unknown;
  createdAt?: unknown;
};

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const collapseWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return okOptionsResponse();

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const body = await parseJsonBody<ReportAlertRequest>(req);
  const reportId = asNonEmptyString(body?.reportId);
  const reportType = asNonEmptyString(body?.reportType);
  const reporterUsername = asNonEmptyString(body?.reporterUsername);
  const serverName = asNonEmptyString(body?.serverName);
  const createdAt = asNonEmptyString(body?.createdAt);

  if (!reportId || !reportType || !reporterUsername || !serverName || !createdAt) {
    return jsonResponse({ error: 'Invalid payload' }, 400);
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!resendApiKey) {
    console.error('report-alert missing RESEND_API_KEY');
    return jsonResponse({ ok: false }, 200);
  }

  const normalizedReportType = collapseWhitespace(reportType);
  const normalizedReporterUsername = collapseWhitespace(reporterUsername);
  const normalizedServerName = collapseWhitespace(serverName);
  const normalizedCreatedAt = collapseWhitespace(createdAt);

  const text = [
    'A new report has been filed on Haven.',
    '',
    `Report ID: ${reportId}`,
    `Type: ${normalizedReportType}`,
    `Reporter: ${normalizedReporterUsername}`,
    `Server: ${normalizedServerName}`,
    `Filed at: ${normalizedCreatedAt}`,
    '',
    'Review at: https://projects.haven.redrixx.com/admin',
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'alerts@redrixx.com',
        to: ['legal@redrixx.com'],
        subject: `[Haven Report] New ${normalizedReportType} report #${reportId}`,
        text,
      }),
    });

    if (!response.ok) {
      console.error('report-alert resend request failed', {
        status: response.status,
        statusText: response.statusText,
        body: await response.text(),
      });
      return jsonResponse({ ok: false }, 200);
    }
  } catch (error) {
    console.error('report-alert resend request errored', error);
    return jsonResponse({ ok: false }, 200);
  }

  return jsonResponse({ ok: true }, 200);
});
