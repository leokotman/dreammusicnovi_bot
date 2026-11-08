import { ApiError, CHAT_ID } from './contract';

export interface DeliveryConfig {
  databaseUrl: string;
  apiSecrets: string[];
  executionSecrets: string[];
  botToken: string;
  adminIds: string[];
  publisherUrl: string;
  publisherSecret: string;
}

export function readConfig(env: NodeJS.ProcessEnv): DeliveryConfig {
  if (env.WEBSITE_DELIVERY_ENABLED !== 'true')
    throw new ApiError(503, 'delivery-disabled');
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new ApiError(503, 'delivery-unconfigured');
    return value;
  };
  const secret = (name: string) => {
    const value = required(name);
    if (value.length < 32) throw new ApiError(503, 'delivery-unconfigured');
    return value;
  };
  const botToken = required('BOT_TOKEN');
  const botId = required('WEBSITE_DELIVERY_BOT_ID');
  const adminIds = [
    ...new Set(
      required('WEBSITE_NOTIFICATION_CHAT_IDS')
        .split(',')
        .map((id) => id.trim()),
    ),
  ];
  const databaseUrl = required('BOT_DELIVERY_DATABASE_URL');
  const publisherUrl = required('DELIVERY_QUEUE_PUBLISH_URL');
  if (
    !/^[1-9][0-9]*$/.test(botId) ||
    !botToken.startsWith(`${botId}:`) ||
    adminIds.some((id) => !CHAT_ID.test(id)) ||
    !/^postgres(ql)?:\/\//.test(databaseUrl) ||
    !publisherUrl.startsWith('https://')
  )
    throw new ApiError(503, 'delivery-unconfigured');
  try {
    new URL(publisherUrl);
    new URL(databaseUrl);
  } catch {
    throw new ApiError(503, 'delivery-unconfigured');
  }
  const apiSecrets = [secret('WEBSITE_DELIVERY_API_SECRET')];
  const executionSecrets = [secret('WEBSITE_DELIVERY_EXECUTION_SECRET')];
  if (env.WEBSITE_DELIVERY_API_SECRET_PREVIOUS)
    apiSecrets.push(secret('WEBSITE_DELIVERY_API_SECRET_PREVIOUS'));
  if (env.WEBSITE_DELIVERY_EXECUTION_SECRET_PREVIOUS)
    executionSecrets.push(secret('WEBSITE_DELIVERY_EXECUTION_SECRET_PREVIOUS'));
  const publisherSecret = secret('DELIVERY_QUEUE_PUBLISH_SECRET');
  if (
    apiSecrets.some(
      (value) => executionSecrets.includes(value) || value === publisherSecret,
    ) ||
    executionSecrets.includes(publisherSecret)
  ) {
    throw new ApiError(503, 'delivery-unconfigured');
  }
  return {
    databaseUrl,
    apiSecrets,
    executionSecrets,
    botToken,
    adminIds,
    publisherUrl,
    publisherSecret,
  };
}
