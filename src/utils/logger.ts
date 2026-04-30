type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function shouldLog(currentLevel: LogLevel, targetLevel: LogLevel) {
  return levelOrder[targetLevel] >= levelOrder[currentLevel];
}

export function createLogger(currentLevel: LogLevel) {
  return {
    debug(message: string, context?: Record<string, unknown>) {
      if (shouldLog(currentLevel, "debug")) {
        console.error(JSON.stringify({ level: "debug", message, context }));
      }
    },
    info(message: string, context?: Record<string, unknown>) {
      if (shouldLog(currentLevel, "info")) {
        console.error(JSON.stringify({ level: "info", message, context }));
      }
    },
    warn(message: string, context?: Record<string, unknown>) {
      if (shouldLog(currentLevel, "warn")) {
        console.error(JSON.stringify({ level: "warn", message, context }));
      }
    },
    error(message: string, context?: Record<string, unknown>) {
      if (shouldLog(currentLevel, "error")) {
        console.error(JSON.stringify({ level: "error", message, context }));
      }
    }
  };
}
