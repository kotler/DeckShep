import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { checked } from './process.mjs';

const page = z.object({ hasNextPage: z.boolean() });
const url = z
  .string()
  .url()
  .refine((value) => value.startsWith('https://'));
const oid = z.string().regex(/^[a-f0-9]{40}$/);
const context = z.discriminatedUnion('__typename', [
  z.object({
    __typename: z.literal('CheckRun'),
    name: z.string().max(512),
    status: z.string(),
    conclusion: z.string().nullable(),
    detailsUrl: url.nullable(),
  }),
  z.object({
    __typename: z.literal('StatusContext'),
    context: z.string().max(512),
    state: z.string(),
    targetUrl: url.nullable(),
  }),
]);
const response = z.object({
  data: z.object({
    repository: z.object({
      pullRequests: z.object({
        totalCount: z.number().int().nonnegative(),
        pageInfo: page.extend({ endCursor: z.string().nullable() }),
        nodes: z
          .array(
            z.object({
              number: z.number().int().positive(),
              title: z.string().max(10000),
              url,
              isDraft: z.boolean(),
              baseRefName: z.string(),
              headRefName: z.string(),
              headRefOid: oid,
              mergeable: z.string(),
              mergeStateStatus: z.string(),
              reviewDecision: z.string().nullable(),
              reviewThreads: z.object({
                nodes: z.array(z.object({ isResolved: z.boolean() })).max(100),
                pageInfo: page,
              }),
              commits: z.object({
                nodes: z
                  .array(
                    z.object({
                      commit: z.object({
                        oid,
                        statusCheckRollup: z
                          .object({
                            contexts: z.object({
                              nodes: z.array(context).max(100),
                              pageInfo: page,
                            }),
                          })
                          .nullable(),
                      }),
                    }),
                  )
                  .max(1),
              }),
            }),
          )
          .max(50),
      }),
    }),
  }),
  errors: z.array(z.unknown()).optional(),
});

// Intentionally omit PR bodies, diffs, comments and review text from the request.
export const statusQuery = `query($owner:String!,$name:String!,$after:String,$first:Int!) {
 repository(owner:$owner,name:$name) { pullRequests(states:OPEN,first:$first,after:$after,orderBy:{field:CREATED_AT,direction:ASC}) {
  totalCount pageInfo { hasNextPage endCursor } nodes {
   number title url isDraft baseRefName headRefName headRefOid mergeable mergeStateStatus reviewDecision
   reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage } }
   commits(last:1) { nodes { commit { oid statusCheckRollup { contexts(first:100) { pageInfo { hasNextPage } nodes {
    __typename ... on CheckRun { name status conclusion detailsUrl } ... on StatusContext { context state targetUrl }
   } } } } } }
  }
 } }
}`;
const compact = (value, max = 120) =>
  value.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max);
function summarize(pr) {
  const commit = pr.commits.nodes[0]?.commit,
    contexts = commit?.statusCheckRollup?.contexts;
  const checks = {
    passed: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    unknown: 0,
    complete:
      !!contexts &&
      !contexts.pageInfo.hasNextPage &&
      commit.oid === pr.headRefOid,
    details: [],
  };
  for (const item of contexts?.nodes || []) {
    const state =
      item.__typename === 'CheckRun'
        ? item.status === 'COMPLETED'
          ? item.conclusion
          : item.status
        : item.state;
    const kind = ['SUCCESS'].includes(state)
      ? 'passed'
      : [
            'FAILURE',
            'ERROR',
            'CANCELLED',
            'TIMED_OUT',
            'ACTION_REQUIRED',
            'STARTUP_FAILURE',
            'STALE',
          ].includes(state)
        ? 'failed'
        : [
              'QUEUED',
              'IN_PROGRESS',
              'PENDING',
              'WAITING',
              'REQUESTED',
              'EXPECTED',
            ].includes(state)
          ? 'pending'
          : ['NEUTRAL', 'SKIPPED'].includes(state)
            ? 'skipped'
            : 'unknown';
    checks[kind]++;
    if (kind !== 'passed' && checks.details.length < 5)
      checks.details.push({
        name: compact(item.name || item.context),
        state: kind,
        url: item.detailsUrl || item.targetUrl || null,
      });
  }
  checks.state =
    !contexts || !contexts.nodes.length
      ? 'none'
      : !checks.complete || checks.unknown
        ? 'unknown'
        : checks.failed
          ? 'failed'
          : checks.pending
            ? 'pending'
            : checks.passed
              ? 'passed'
              : 'skipped';
  return {
    number: pr.number,
    title: compact(pr.title),
    url: pr.url,
    draft: pr.isDraft,
    base: compact(pr.baseRefName),
    head: compact(pr.headRefName),
    headCommit: pr.headRefOid,
    mergeable: compact(pr.mergeable),
    mergeState: compact(pr.mergeStateStatus),
    reviews: {
      decision: pr.reviewDecision ? compact(pr.reviewDecision) : 'none',
      unresolvedThreads: pr.reviewThreads.nodes.filter(
        (thread) => !thread.isResolved,
      ).length,
      complete: !pr.reviewThreads.pageInfo.hasNextPage,
    },
    checks,
  };
}

export function githubStatus({ repo, limit = 100, run = checked } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw Error('PR limit must be 1 to 500');
  if (!repo) {
    const remote = run('git', ['remote', 'get-url', 'origin'], {
      capture: true,
      message: 'Repository remote unavailable',
    }).trim();
    repo =
      /^(?:git@github\.com:|https:\/\/github\.com\/)([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(
        remote,
      )?.[1];
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo || '')
  )
    throw Error('Use a GitHub owner/repository');
  const [owner, name] = repo.split('/'),
    pulls = [],
    seen = new Set();
  let after = null,
    total = 0,
    more = true;
  while (more && pulls.length < limit) {
    const raw = run('gh', ['api', 'graphql', '--input', '-'], {
      capture: true,
      input: JSON.stringify({
        query: statusQuery,
        variables: {
          owner,
          name,
          after,
          first: Math.min(50, limit - pulls.length),
        },
      }),
      message: 'GitHub PR status request failed',
    });
    const result = response.parse(JSON.parse(raw));
    if (result.errors?.length)
      throw Error('GitHub PR status response contains errors');
    const batch = result.data.repository.pullRequests;
    total = batch.totalCount;
    if (batch.nodes.length > limit - pulls.length)
      throw Error('Unexpected PR page size');
    for (const pr of batch.nodes) {
      if (seen.has(pr.number))
        throw Error('PR inventory changed during pagination; retry');
      seen.add(pr.number);
      pulls.push(summarize(pr));
    }
    more = batch.pageInfo.hasNextPage;
    if (
      more &&
      (!batch.nodes.length ||
        !batch.pageInfo.endCursor ||
        batch.pageInfo.endCursor === after)
    )
      throw Error('PR pagination incomplete');
    after = batch.pageInfo.endCursor;
  }
  return {
    repository: repo,
    total,
    shown: pulls.length,
    complete: !more && pulls.length === total,
    pullRequests: pulls,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2),
      options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--repo', '--limit'].includes(args[i]) || !args[i + 1])
        throw Error('Invalid PR status options');
      options[args[i].slice(2)] =
        args[i] === '--limit' ? Number(args[i + 1]) : args[i + 1];
    }
    console.log(JSON.stringify(githubStatus(options), null, 2));
  } catch {
    console.error(
      'PR status unavailable; check authentication, repository and response completeness',
    );
    process.exitCode = 1;
  }
}
