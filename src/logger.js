import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pino from "pino";
import pinoHttp from "pino-http";
import client from "prom-client";

const asyncLocalStorage = new AsyncLocalStorage();

export const requestContext = {
  run(requestId, callback) {
    return asyncLocalStorage.run({ requestId }, callback);
  },
  getRequestId() {
    return asyncLocalStorage.getStore()?.requestId ?? null;
  },
};

export const apiRequestDurationSeconds = new client.Histogram({
  name: "api_request_duration_seconds",
  help: "API request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

export const metricsRegistry = client.register;

const createBaseLogger = (destination = process.stdout) =>
  pino(
    {
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: ["req.headers", "res.headers"],
      serializers: {
        req(req) {
          if (!req) return req;
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            ip: req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress,
          };
        },
        res(res) {
          if (!res) return res;
          return { status: res.statusCode };
        },
      },
    },
    destination
  );

export const defaultLogger = createBaseLogger();

export function createLogger(destination = process.stdout) {
  return createBaseLogger(destination);
}

export function getLogger() {
  const requestId = requestContext.getRequestId();
  return requestId ? defaultLogger.child({ requestId }) : defaultLogger;
}

export function requestIdMiddleware(req, res, next) {
  const incoming = req.header("X-Request-Id")?.toString();
  const requestId = incoming || randomUUID();
  req.id = requestId;
  res.setHeader("X-Request-Id", requestId);

  if (req.header("traceparent")) {
    res.setHeader("traceparent", req.header("traceparent"));
  }
  if (req.header("tracestate")) {
    res.setHeader("tracestate", req.header("tracestate"));
  }

  requestContext.run(requestId, () => next());
}

export function createHttpLogger(destination) {
  const logger = createLogger(destination);
  return pinoHttp({
    logger,
    genReqId(req) {
      return req.id || req.header("X-Request-Id")?.toString() || randomUUID();
    },
    customLogLevel(res, err) {
      if (res.statusCode >= 500 || err) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customSuccessMessage: "request completed",
    customErrorMessage: "request errored",
    autoLogging: true,
  });
}

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const route = req.route?.path || req.originalUrl || req.url || "unknown";
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    apiRequestDurationSeconds.labels(req.method, route, String(res.statusCode)).observe(durationSeconds);
  });

  next();
}
