// Creates the bucket and one editor IAM user. Safe to rerun: every step converges.
// The editor's access key is written to .env, never printed.

import { readFileSync, writeFileSync } from 'node:fs';
import {
  S3Client, CreateBucketCommand, HeadBucketCommand, PutPublicAccessBlockCommand,
  PutBucketWebsiteCommand, PutBucketVersioningCommand, PutBucketCorsCommand, PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import {
  IAMClient, GetUserCommand, CreateUserCommand, PutUserPolicyCommand, CreateAccessKeyCommand, ListAccessKeysCommand,
} from '@aws-sdk/client-iam';
import { bucket, region, websiteOrigin, websiteHost, siteOrigin, editorUser } from './config.js';

const s3 = new S3Client({ region });
const iam = new IAMClient({ region });

async function exists(fn) {
  try { await fn(); return true; } catch (e) {
    if (e.name === 'NotFound' || e.name === 'NoSuchEntity' || e.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

if (!await exists(() => s3.send(new HeadBucketCommand({ Bucket: bucket })))) {
  await s3.send(new CreateBucketCommand({
    Bucket: bucket,
    CreateBucketConfiguration: { LocationConstraint: region },
  }));
  console.log(`created bucket ${bucket}`);
}

await s3.send(new PutPublicAccessBlockCommand({
  Bucket: bucket,
  PublicAccessBlockConfiguration: {
    BlockPublicAcls: true, IgnorePublicAcls: true, BlockPublicPolicy: false, RestrictPublicBuckets: false,
  },
}));

await s3.send(new PutBucketWebsiteCommand({
  Bucket: bucket,
  WebsiteConfiguration: { IndexDocument: { Suffix: 'index.html' }, ErrorDocument: { Key: '404.html' } },
}));

await s3.send(new PutBucketVersioningCommand({
  Bucket: bucket,
  VersioningConfiguration: { Status: 'Enabled' },
}));

await s3.send(new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [{
      AllowedOrigins: [websiteOrigin, siteOrigin],
      AllowedMethods: ['GET', 'HEAD', 'PUT', 'DELETE'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    }],
  },
}));

await s3.send(new PutBucketPolicyCommand({
  Bucket: bucket,
  Policy: JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Sid: 'PublicRead',
      Effect: 'Allow',
      Principal: '*',
      Action: 's3:GetObject',
      Resource: `arn:aws:s3:::${bucket}/*`,
    }],
  }),
}));
console.log(`bucket configured: ${websiteHost}`);

if (!await exists(() => iam.send(new GetUserCommand({ UserName: editorUser })))) {
  await iam.send(new CreateUserCommand({ UserName: editorUser }));
  console.log(`created IAM user ${editorUser}`);
}

await iam.send(new PutUserPolicyCommand({
  UserName: editorUser,
  PolicyName: 'gratis-editor',
  PolicyDocument: JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: `arn:aws:s3:::${bucket}/*` },
      { Effect: 'Allow', Action: 's3:ListBucket', Resource: `arn:aws:s3:::${bucket}` },
    ],
  }),
}));

// .env holds one editor key: this site's. A key of another user (a previous site) is replaced.
const { AccessKeyMetadata: keys } = await iam.send(new ListAccessKeysCommand({ UserName: editorUser }));
if (!keys.some((k) => k.AccessKeyId === process.env.GRATIS_EDITOR_ACCESS_KEY_ID)) {
  const { AccessKey } = await iam.send(new CreateAccessKeyCommand({ UserName: editorUser }));
  const env = readFileSync('.env', 'utf8').split('\n').filter((line) => line && !/^GRATIS_EDITOR_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=/.test(line));
  env.push(`GRATIS_EDITOR_ACCESS_KEY_ID=${AccessKey.AccessKeyId}`, `GRATIS_EDITOR_SECRET_ACCESS_KEY=${AccessKey.SecretAccessKey}`);
  writeFileSync('.env', env.join('\n') + '\n');
  console.log(`created an access key for ${editorUser}, saved to .env`);
}

console.log('done');
