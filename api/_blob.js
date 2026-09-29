// Blob credentials come either from a read-write token (older store connections)
// or from OIDC + BLOB_STORE_ID (newer connections); @vercel/blob handles both.
export const blobConfigured = () =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
