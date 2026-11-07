// The storage emulator (notes/astro.md), in three layers:
//
//   backends.ts   where the bytes live: memory, a folder, or (in dev) the repo's content files
//   objects.ts    ETags and conditional writes over a backend, the S3 semantics the save relies on
//   http.ts       the S3 wire format and the website endpoint over those objects
//
// The admin talks to http.ts exactly as it talks to S3; tests can use objects.ts in process.

export * from './backends.ts'
export * from './content-type.ts'
export * from './http.ts'
export * from './objects.ts'
