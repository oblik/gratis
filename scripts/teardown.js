// Removes everything the setup scripts created for one site: the Cloudflare CNAME and
// Configuration Rule, every object version in the bucket, the bucket, and the editor IAM user.
// Irreversible, so the bucket name must be repeated.
//
//   GRATIS_SITE=<bucket> node --env-file=.env scripts/teardown.js --confirm <bucket>

import {
  S3Client, ListObjectVersionsCommand, DeleteObjectsCommand, DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import {
  IAMClient, ListAccessKeysCommand, DeleteAccessKeyCommand, ListUserPoliciesCommand, DeleteUserPolicyCommand, DeleteUserCommand,
} from '@aws-sdk/client-iam';
import { bucket, region, zone, websiteHost, editorUser, cloudflareToken } from './config.js';

const confirm = process.argv[process.argv.indexOf('--confirm') + 1];
if (!process.argv.includes('--confirm') || confirm !== bucket) {
  throw new Error(`refusing: pass --confirm ${bucket} to delete ${bucket} and everything in it`);
}

async function cf(method, path) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${cloudflareToken}` },
  });
  const data = await res.json();
  if (!data.success && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(data.errors)}`);
  return { status: res.status, ...data };
}

// Cloudflare: only the record and rule the setup script made.
const { result: [{ id: zoneId } = {}] } = await cf('GET', `/zones?name=${zone}`);
if (!zoneId) throw new Error(`zone ${zone} not found`);
const { result: records } = await cf('GET', `/zones/${zoneId}/dns_records?name=${bucket}&type=CNAME`);
for (const record of records.filter((r) => r.content === websiteHost)) {
  await cf('DELETE', `/zones/${zoneId}/dns_records/${record.id}`);
  console.log(`deleted CNAME ${bucket}`);
}
const entry = await cf('GET', `/zones/${zoneId}/rulesets/phases/http_config_settings/entrypoint`);
const rule = entry.result?.rules?.find((r) => r.ref === 'gratis_flexible_ssl' && r.expression === `(http.host eq "${bucket}")`);
if (rule) {
  await cf('DELETE', `/zones/${zoneId}/rulesets/${entry.result.id}/rules/${rule.id}`);
  console.log('deleted Configuration Rule');
}

// S3: a versioned bucket must be emptied of every version and delete marker first.
const s3 = new S3Client({ region });
let deleted = 0;
for (let page = {}; ;) {
  const res = await s3.send(new ListObjectVersionsCommand({ Bucket: bucket, KeyMarker: page.key, VersionIdMarker: page.version }));
  const objects = [...(res.Versions ?? []), ...(res.DeleteMarkers ?? [])].map(({ Key, VersionId }) => ({ Key, VersionId }));
  if (objects.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
    deleted += objects.length;
  }
  if (!res.IsTruncated) break;
  page = { key: res.NextKeyMarker, version: res.NextVersionIdMarker };
}
await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
console.log(`deleted ${deleted} object version(s) and bucket ${bucket}`);

// IAM
const iam = new IAMClient({ region });
for (const { AccessKeyId } of (await iam.send(new ListAccessKeysCommand({ UserName: editorUser }))).AccessKeyMetadata) {
  await iam.send(new DeleteAccessKeyCommand({ UserName: editorUser, AccessKeyId }));
}
for (const PolicyName of (await iam.send(new ListUserPoliciesCommand({ UserName: editorUser }))).PolicyNames) {
  await iam.send(new DeleteUserPolicyCommand({ UserName: editorUser, PolicyName }));
}
await iam.send(new DeleteUserCommand({ UserName: editorUser }));
console.log(`deleted IAM user ${editorUser}`);
