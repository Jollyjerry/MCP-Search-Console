const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 16 * 30;

export type DateRangePreset =
  | "last_7_days"
  | "last_28_days"
  | "last_30_days"
  | "last_90_days"
  | "last_365_days"
  | "last_16_months";

export type NormalizedDateRange = {
  startDate: string;
  endDate: string;
  label: string;
};

type NormalizeDateRangeInput = {
  preset?: DateRangePreset;
  startDate?: string;
  endDate?: string;
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function diffDaysInclusive(startDate: Date, endDate: Date) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
}

function assertMaxRange(startDate: Date, endDate: Date) {
  const days = diffDaysInclusive(startDate, endDate);
  if (days > MAX_RANGE_DAYS) {
    throw new Error(`Date range exceeds Search Console retention (${MAX_RANGE_DAYS} days).`);
  }
}

export function normalizeDateRange(input: NormalizeDateRangeInput): NormalizedDateRange {
  const today = startOfUtcDay(new Date());
  const preset = input.preset ?? (input.startDate || input.endDate ? undefined : "last_28_days");

  if (preset) {
    const endDate = addDays(today, -1);
    let startDate: Date;
    let label: string;
    switch (preset) {
      case "last_7_days":
        startDate = addDays(endDate, -6);
        label = "Last 7 days";
        break;
      case "last_28_days":
        startDate = addDays(endDate, -27);
        label = "Last 28 days";
        break;
      case "last_30_days":
        startDate = addDays(endDate, -29);
        label = "Last 30 days";
        break;
      case "last_90_days":
        startDate = addDays(endDate, -89);
        label = "Last 90 days";
        break;
      case "last_365_days":
        startDate = addDays(endDate, -364);
        label = "Last 365 days";
        break;
      case "last_16_months":
        startDate = addDays(endDate, -(16 * 30 - 1));
        label = "Last 16 months";
        break;
      default:
        throw new Error("Unsupported date range preset.");
    }
    return { startDate: formatDate(startDate), endDate: formatDate(endDate), label };
  }

  if (!input.startDate || !input.endDate) {
    throw new Error("Custom date range requires both startDate and endDate.");
  }

  const startDate = startOfUtcDay(new Date(input.startDate));
  const endDate = startOfUtcDay(new Date(input.endDate));

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid custom date range.");
  }

  if (startDate > endDate) {
    throw new Error("startDate must be before or equal to endDate.");
  }

  assertMaxRange(startDate, endDate);

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    label: `${formatDate(startDate)} to ${formatDate(endDate)}`
  };
}
