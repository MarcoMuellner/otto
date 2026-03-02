export type InteractiveContextDeliveryStatus =
  | "queued"
  | "sent"
  | "failed"
  | "held";

export type InteractiveContextPromptEvent = {
  sourceLane: string;
  sourceKind: string;
  sourceRef: string | null;
  content: string;
  deliveryStatus: InteractiveContextDeliveryStatus;
  deliveryStatusDetail: string | null;
  errorMessage: string | null;
};

export const DEFAULT_INTERACTIVE_CONTEXT_LIMIT = 20;
export const MIN_INTERACTIVE_CONTEXT_LIMIT = 5;
export const MAX_INTERACTIVE_CONTEXT_LIMIT = 200;
export const INTERACTIVE_CONTEXT_MAX_LINE_LENGTH = 220;

const normalizeWhitespace = (value: string): string => {
  return value.replaceAll(/\s+/g, " ").trim();
};

const shorten = (
  value: string,
  maxLength: number,
): {
  value: string;
  truncated: boolean;
} => {
  if (value.length <= maxLength) {
    return { value, truncated: false };
  }

  return {
    value: `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`,
    truncated: true,
  };
};

export const toInteractiveContextStatusLabel = (
  status: InteractiveContextDeliveryStatus,
): string => {
  if (status === "sent") {
    return "sent";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "held") {
    return "held";
  }

  return "queued";
};

export const normalizeInteractiveContextWindowSize = (
  input: unknown,
): number => {
  if (typeof input !== "number" || !Number.isInteger(input)) {
    return DEFAULT_INTERACTIVE_CONTEXT_LIMIT;
  }

  return Math.max(
    MIN_INTERACTIVE_CONTEXT_LIMIT,
    Math.min(MAX_INTERACTIVE_CONTEXT_LIMIT, input),
  );
};

export const buildInteractiveContextPromptBlock = (
  events: InteractiveContextPromptEvent[],
): {
  block: string | null;
  includedEvents: number;
  truncated: boolean;
} => {
  if (events.length === 0) {
    return {
      block: null,
      includedEvents: 0,
      truncated: false,
    };
  }

  const lines: string[] = [];
  let truncated = false;

  for (const event of events) {
    const sourceParts = [
      normalizeWhitespace(event.sourceLane),
      normalizeWhitespace(event.sourceKind),
    ]
      .filter((value) => value.length > 0)
      .join("/");
    const sourceRef = normalizeWhitespace(event.sourceRef ?? "");
    const source =
      sourceRef.length > 0 ? `${sourceParts}(${sourceRef})` : sourceParts;
    const detail = normalizeWhitespace(
      event.deliveryStatusDetail ?? event.errorMessage ?? "",
    );
    const content = normalizeWhitespace(event.content);

    if (content.length === 0) {
      continue;
    }

    const summary = detail.length > 0 ? `${content} (${detail})` : content;
    const shortened = shorten(summary, INTERACTIVE_CONTEXT_MAX_LINE_LENGTH);
    truncated = truncated || shortened.truncated;
    lines.push(
      `- [${toInteractiveContextStatusLabel(event.deliveryStatus)}] ${source}: ${shortened.value}`,
    );
  }

  if (lines.length === 0) {
    return {
      block: null,
      includedEvents: 0,
      truncated,
    };
  }

  return {
    block: [
      "Recent non-interactive context:",
      ...lines,
      "Use this only as supporting context when it is relevant.",
    ].join("\n"),
    includedEvents: lines.length,
    truncated,
  };
};
