type LogLevel = "info" | "warn" | "error";

interface StructuredLog {
  level: LogLevel;
  message: string;
  context?: Record<string, string | number | boolean | null>;
}

export function writeLog(log: StructuredLog): void {
  const output = JSON.stringify(log);

  if (log.level === "error") {
    console.error(output);
    return;
  }

  if (log.level === "warn") {
    console.warn(output);
    return;
  }

  console.info(output);
}
