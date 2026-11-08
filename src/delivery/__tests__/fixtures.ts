import { EnrollmentEvent, TEMPLATE_VERSION } from "../contract";
import { DeliveryConfig } from "../config";
export const event: EnrollmentEvent = {
  eventId: "e858af47-9168-420d-9323-bd48763c5af8", enrollmentReference: "123",
  submittedAt: "2026-11-08T14:00:00.000Z", telegramUserId: "123456789",
  templateVersion: TEMPLATE_VERSION,
  submission: { name: "Visitor <b>literal</b>", contact: "@example_user", lessonName: "Piano", comment: "A question" },
};
export const config: DeliveryConfig = {
  databaseUrl: "postgresql://localhost/delivery_scratch_test", botToken: "9101311802:fake-token",
  apiSecrets: ["a".repeat(32)], executionSecrets: ["e".repeat(32)], adminIds: ["111", "222"],
  publisherUrl: "https://queue.example.test/publish", publisherSecret: "p".repeat(32),
};
export function configEnv(): NodeJS.ProcessEnv {
  return { WEBSITE_DELIVERY_ENABLED: "true", BOT_DELIVERY_DATABASE_URL: config.databaseUrl,
    BOT_TOKEN: config.botToken, WEBSITE_DELIVERY_BOT_ID: "9101311802", WEBSITE_NOTIFICATION_CHAT_IDS: "111,222,111",
    WEBSITE_DELIVERY_API_SECRET: config.apiSecrets[0], WEBSITE_DELIVERY_EXECUTION_SECRET: config.executionSecrets[0],
    DELIVERY_QUEUE_PUBLISH_URL: config.publisherUrl, DELIVERY_QUEUE_PUBLISH_SECRET: config.publisherSecret };
}
