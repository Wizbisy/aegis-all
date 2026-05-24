import pino from 'pino';
import { config } from '../config.js';
import { requestContext } from './requestid.js';

const loggerOptions: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
  mixin() {
    const store = requestContext.getStore();
    return store ? { requestId: store.requestId } : {};
  },
  redact: {
    paths: [
      'email',
      'password',
      'pin',
      'otp',
      'token',
      'tokenHash',
      'jwt',
      'authorization',
      'req.headers.authorization',
      'headers.authorization',
      '*.authorization',
      '*.otp',
      '*.token',
    ],
    censor: '***REDACTED***',
  },
};

if (config.NODE_ENV === 'development') {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  };
}

export const logger = pino(loggerOptions);
