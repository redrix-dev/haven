import type {
  NotificationDecisionStage,
  NotificationDeliveryReasonCode,
  NotificationDeliveryTransport,
  NotificationRouteDecision,
} from '@/lib/notifications/routePolicy';

export type LocalNotificationDeliveryTraceRecord = {
  id: string;
  notificationRecipientId: string | null;
  eventId: string | null;
  transport: NotificationDeliveryTransport;
  stage: NotificationDecisionStage;
  decision: NotificationRouteDecision;
  reasonCode: NotificationDeliveryReasonCode;
  details: Record<string, unknown>;
  createdAt: string;
};

const STORAGE_KEY = 'haven:notifications:dev-traces';
const MAX_TRACES = 250;

const canUseLocalStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safeParseTraceArray = (raw: string | null): LocalNotificationDeliveryTraceRecord[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalNotificationDeliveryTraceRecord[]) : [];
  } catch {
    return [];
  }
};

const readTraces = (): LocalNotificationDeliveryTraceRecord[] => {
  if (!canUseLocalStorage()) return [];
  try {
    return safeParseTraceArray(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
};

const writeTraces = (items: LocalNotificationDeliveryTraceRecord[]): void => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_TRACES)));
  } catch {
    // Ignore storage quota/private mode errors.
  }
};

const createTraceId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const recordLocalNotificationDeliveryTrace = (input: {
  notificationRecipientId?: string | null;
  eventId?: string | null;
  transport: NotificationDeliveryTransport;
  stage: NotificationDecisionStage;
  decision: NotificationRouteDecision;
  reasonCode: NotificationDeliveryReasonCode;
  details?: Record<string, unknown> | null;
}): LocalNotificationDeliveryTraceRecord => {
  const record: LocalNotificationDeliveryTraceRecord = {
    id: createTraceId(),
    notificationRecipientId: input.notificationRecipientId ?? null,
    eventId: input.eventId ?? null,
    transport: input.transport,
    stage: input.stage,
    decision: input.decision,
    reasonCode: input.reasonCode,
    details: input.details ?? {},
    createdAt: new Date().toISOString(),
  };

  const next = [record, ...readTraces()];
  writeTraces(next);
  return record;
};

export const listLocalNotificationDeliveryTraces = (
  limit = 100
): LocalNotificationDeliveryTraceRecord[] =>
  readTraces().slice(0, Math.max(1, Math.min(500, Math.trunc(limit))));

export const clearLocalNotificationDeliveryTraces = (): void => {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
};

