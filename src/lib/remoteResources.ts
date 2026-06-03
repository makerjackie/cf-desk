import { invokeCloudflare } from "@/hooks/useCloudflare";
import { CACHE_TTL_MS, useAppStore } from "@/store/useAppStore";

export interface RemoteCacheOptions {
  force?: boolean;
  fallbackOnError?: boolean;
  ttlMs?: number;
}

export interface KVNamespace {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
}

export interface KVKey {
  name: string;
  expiration?: number;
  metadata?: unknown;
}

export interface KVKeyListResult {
  keys: KVKey[];
  cursor?: string;
}

export interface KVEntry {
  key: string;
  value: string;
  metadata?: unknown;
  expiration?: string;
}

export interface RemoteSection<T = unknown> {
  data?: T | null;
  error?: string | null;
}

export interface WorkerSummary {
  name: string;
  created_on?: string;
  modified_on?: string;
  last_deployed_from?: string;
  workers_dev_url?: string;
  routes: unknown[];
  domains: unknown[];
  bindings: unknown[];
  observability?: unknown;
  recent_metrics?: WorkerHealthSummary | null;
  raw: Record<string, unknown>;
}

export interface WorkerStatusSummary {
  status: string;
  requests: number;
}

export interface WorkerHealthSummary {
  start: string;
  end: string;
  requests: number;
  errors: number;
  subrequests: number;
  statuses: WorkerStatusSummary[];
}

export interface WorkersOverview {
  account_id: string;
  account_subdomain?: string;
  subdomain_error?: string;
  domains_error?: string;
  metrics_error?: string;
  workers: WorkerSummary[];
}

export interface WorkerDetail {
  account_id: string;
  account_subdomain?: string;
  script: Record<string, unknown>;
  domains: unknown[];
  subdomain: RemoteSection<Record<string, unknown>>;
  settings: RemoteSection<Record<string, unknown>>;
  script_settings: RemoteSection<Record<string, unknown>>;
  deployments: RemoteSection<Record<string, unknown>>;
  versions: RemoteSection<Record<string, unknown>>;
  secrets: RemoteSection<unknown[]>;
  schedules: RemoteSection<Record<string, unknown>>;
  tails: RemoteSection<Record<string, unknown>>;
}

export interface WorkerMetrics {
  start: string;
  end: string;
  rows: Record<string, unknown>[];
  raw: Record<string, unknown>;
}

export interface QueuesOverview {
  account_id: string;
  queues: Record<string, unknown>[];
}

export interface QueueDetail {
  queue: RemoteSection<Record<string, unknown>>;
  metrics: RemoteSection<Record<string, unknown>>;
}

function cachePart(value: unknown) {
  return encodeURIComponent(String(value ?? ""));
}

function currentAccountScope() {
  const store = useAppStore.getState();
  return cachePart(store.activeAccount?.id ?? store.cloudflareAccountId ?? "default");
}

function remoteCacheKey(...parts: unknown[]) {
  return ["remote", currentAccountScope(), ...parts.map(cachePart)].join(":");
}

function getRemoteCacheEntry<T>(key: string) {
  return useAppStore.getState().remoteResourceCache[key] as
    | { data: T; timestamp: number }
    | undefined;
}

function isFresh(timestamp: number, ttlMs: number) {
  return Date.now() - timestamp < ttlMs;
}

async function cachedInvokeCloudflare<T>(
  key: string,
  cmd: string,
  args?: Record<string, unknown>,
  options: RemoteCacheOptions = {},
  onNetworkSuccess?: (data: T) => void
): Promise<T> {
  const ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  const cached = getRemoteCacheEntry<T>(key);

  if (!options.force && cached && isFresh(cached.timestamp, ttlMs)) {
    return cached.data;
  }

  try {
    const data = await invokeCloudflare<T>(cmd, args);
    useAppStore.getState().setRemoteResourceCacheItem(key, data);
    onNetworkSuccess?.(data);
    return data;
  } catch (error) {
    if ((options.fallbackOnError ?? true) && cached) {
      return cached.data;
    }
    throw error;
  }
}

function clearRemoteCache(...parts: unknown[]) {
  useAppStore.getState().clearRemoteResourceCache(remoteCacheKey(...parts));
}

export function fetchKVNamespaces(options: RemoteCacheOptions = {}): Promise<KVNamespace[]> {
  return cachedInvokeCloudflare<KVNamespace[]>(
    remoteCacheKey("kv", "namespaces"),
    "fetch_kv_namespaces",
    undefined,
    options,
    (namespaces) => useAppStore.getState().setKvNamespaces(namespaces)
  );
}

export function listKVKeys(
  namespaceId: string,
  prefix: string,
  cursor?: string,
  limit = 100,
  options: RemoteCacheOptions = {}
): Promise<KVKeyListResult> {
  return cachedInvokeCloudflare<KVKeyListResult>(
    remoteCacheKey("kv", "keys", namespaceId, prefix, cursor ?? "", limit),
    "list_kv_keys",
    {
      namespaceId,
      prefix,
      cursor,
      limit,
    },
    options
  );
}

export function getKVEntry(
  namespaceId: string,
  keyName: string,
  options: RemoteCacheOptions = {}
): Promise<KVEntry> {
  return cachedInvokeCloudflare<KVEntry>(
    remoteCacheKey("kv", "entry", namespaceId, keyName),
    "get_kv_entry",
    { namespaceId, keyName },
    options
  );
}

export function putKVEntry(
  namespaceId: string,
  keyName: string,
  value: string,
  expirationTtl?: number,
  expiration?: string,
  metadata?: unknown
): Promise<void> {
  return invokeCloudflare<void>("put_kv_entry", {
    namespaceId,
    keyName,
    value,
    expirationTtl,
    expiration,
    metadata,
  }).then((result) => {
    clearRemoteCache("kv", "keys", namespaceId);
    clearRemoteCache("kv", "entry", namespaceId, keyName);
    return result;
  });
}

export function deleteKVEntry(namespaceId: string, keyName: string): Promise<void> {
  return invokeCloudflare<void>("delete_kv_entry", { namespaceId, keyName }).then((result) => {
    clearRemoteCache("kv", "keys", namespaceId);
    clearRemoteCache("kv", "entry", namespaceId, keyName);
    return result;
  });
}

export function fetchWorkersOverview(options: RemoteCacheOptions = {}): Promise<WorkersOverview> {
  return cachedInvokeCloudflare<WorkersOverview>(
    remoteCacheKey("workers", "overview"),
    "fetch_workers_overview",
    undefined,
    options
  );
}

export function fetchWorkerDetail(
  scriptName: string,
  options: RemoteCacheOptions = {}
): Promise<WorkerDetail> {
  return cachedInvokeCloudflare<WorkerDetail>(
    remoteCacheKey("workers", "detail", scriptName),
    "fetch_worker_detail",
    { scriptName },
    options
  );
}

export function upsertWorkerSecret(
  scriptName: string,
  secretName: string,
  secretValue: string
): Promise<void> {
  return invokeCloudflare<void>("upsert_worker_secret", {
    scriptName,
    secretName,
    secretValue,
  }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function setWorkerSubdomain(
  scriptName: string,
  enabled: boolean,
  previewsEnabled: boolean
): Promise<unknown> {
  return invokeCloudflare<unknown>("set_worker_subdomain", {
    scriptName,
    enabled,
    previewsEnabled,
  }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function updateWorkerSchedules(scriptName: string, crons: string[]): Promise<unknown> {
  return invokeCloudflare<unknown>("update_worker_schedules", { scriptName, crons }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function startWorkerTail(scriptName: string): Promise<unknown> {
  return invokeCloudflare<unknown>("start_worker_tail", { scriptName });
}

export function updateWorkerObservability(
  scriptName: string,
  enabled: boolean,
  headSamplingRate: number,
  invocationLogs: boolean
): Promise<unknown> {
  return invokeCloudflare<unknown>("update_worker_observability", {
    scriptName,
    enabled,
    headSamplingRate,
    invocationLogs,
  }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function fetchWorkerMetrics(scriptName: string, minutes: number): Promise<WorkerMetrics> {
  return invokeCloudflare<WorkerMetrics>("fetch_worker_metrics", { scriptName, minutes });
}

export function attachWorkerDomain(
  scriptName: string,
  hostname: string,
  zoneId?: string,
  zoneName?: string,
  environment?: string
): Promise<unknown> {
  return invokeCloudflare<unknown>("attach_worker_domain", {
    scriptName,
    hostname,
    zoneId,
    zoneName,
    environment,
  }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function detachWorkerDomain(domainId: string): Promise<unknown> {
  return invokeCloudflare<unknown>("detach_worker_domain", { domainId }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function attachWorkerRoute(scriptName: string, zoneId: string, pattern: string): Promise<unknown> {
  return invokeCloudflare<unknown>("attach_worker_route", { scriptName, zoneId, pattern }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function detachWorkerRoute(zoneId: string, routeId: string): Promise<unknown> {
  return invokeCloudflare<unknown>("detach_worker_route", { zoneId, routeId }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function deleteWorkerSecret(scriptName: string, secretName: string): Promise<void> {
  return invokeCloudflare<void>("delete_worker_secret", { scriptName, secretName }).then((result) => {
    clearRemoteCache("workers");
    return result;
  });
}

export function fetchQueuesOverview(options: RemoteCacheOptions = {}): Promise<QueuesOverview> {
  return cachedInvokeCloudflare<QueuesOverview>(
    remoteCacheKey("queues", "overview"),
    "fetch_queues_overview",
    undefined,
    options
  );
}

export function fetchQueueDetail(queueId: string, options: RemoteCacheOptions = {}): Promise<QueueDetail> {
  return cachedInvokeCloudflare<QueueDetail>(
    remoteCacheKey("queues", "detail", queueId),
    "fetch_queue_detail",
    { queueId },
    options
  );
}

export function sendQueueMessage(
  queueId: string,
  body: string,
  contentType: "text" | "json",
  delaySeconds?: number
): Promise<unknown> {
  return invokeCloudflare<unknown>("send_queue_message", {
    queueId,
    body,
    contentType,
    delaySeconds,
  }).then((result) => {
    clearRemoteCache("queues");
    return result;
  });
}

export function sendQueueBatch(
  queueId: string,
  messages: string[],
  contentType: "text" | "json",
  delaySeconds?: number
): Promise<unknown> {
  return invokeCloudflare<unknown>("send_queue_batch", {
    queueId,
    messages,
    contentType,
    delaySeconds,
  }).then((result) => {
    clearRemoteCache("queues");
    return result;
  });
}
