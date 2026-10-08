import { isBlobConfigured } from "../storage";

describe("isBlobConfigured", () => {
  const originalStoreId = process.env.BLOB_STORE_ID;
  const originalReadWriteToken = process.env.BLOB_READ_WRITE_TOKEN;

  afterEach(() => {
    if (originalStoreId === undefined) {
      delete process.env.BLOB_STORE_ID;
    } else {
      process.env.BLOB_STORE_ID = originalStoreId;
    }
    if (originalReadWriteToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalReadWriteToken;
    }
  });

  it("uses Blob when configured with OIDC store credentials", () => {
    process.env.BLOB_STORE_ID = "store-id";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(isBlobConfigured()).toBe(true);
  });

  it("continues to support a static read-write token", () => {
    delete process.env.BLOB_STORE_ID;
    process.env.BLOB_READ_WRITE_TOKEN = "static-token";

    expect(isBlobConfigured()).toBe(true);
  });

  it("uses local storage when no Blob credentials are configured", () => {
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    expect(isBlobConfigured()).toBe(false);
  });
});
