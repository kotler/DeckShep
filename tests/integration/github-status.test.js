const { test } = require('node:test');
const assert = require('node:assert/strict');
const head = 'a'.repeat(40);
function pr(number = 1) {
  return {
    number,
    title: 'Fixture PR',
    url: `https://github.com/fixture/repo/pull/${number}`,
    isDraft: false,
    baseRefName: 'main',
    headRefName: 'fixture',
    headRefOid: head,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    reviewDecision: 'APPROVED',
    reviewThreads: { nodes: [], pageInfo: { hasNextPage: false } },
    commits: {
      nodes: [
        {
          commit: {
            oid: head,
            statusCheckRollup: {
              contexts: { nodes: [], pageInfo: { hasNextPage: false } },
            },
          },
        },
      ],
    },
  };
}
const check = (status = 'COMPLETED', conclusion = 'SUCCESS') => ({
  __typename: 'CheckRun',
  name: 'CI',
  status,
  conclusion,
  detailsUrl: 'https://github.com/fixture/repo/actions/runs/1',
});
const result = (nodes, total = nodes.length, more = false, cursor = null) =>
  JSON.stringify({
    data: {
      repository: {
        pullRequests: {
          totalCount: total,
          nodes,
          pageInfo: { hasNextPage: more, endCursor: cursor },
        },
      },
    },
  });
test('compact PR status requests only metadata and check/review summaries, omitting bodies and passed check details', async () => {
  const { githubStatus, statusQuery } =
    await import('../../scripts/github-status.mjs');
  assert(!/\b(body|diff|patch|comments|reviews)\b/.test(statusQuery));
  const item = pr();
  item.title = 'Readable\n' + 'x'.repeat(200);
  item.body = 'PRIVATE BODY';
  item.patch = 'PRIVATE PATCH';
  item.commits.nodes[0].commit.statusCheckRollup.contexts.nodes = Array.from(
    { length: 100 },
    () => check(),
  );
  const out = githubStatus({
    repo: 'fixture/repo',
    run: (file, args, options) => {
      assert.equal(file, 'gh');
      assert.deepEqual(args, ['api', 'graphql', '--input', '-']);
      const input = JSON.parse(options.input);
      assert.equal(input.query, statusQuery);
      return result([item]);
    },
  });
  assert.equal(out.complete, true);
  assert.equal(out.pullRequests[0].checks.passed, 100);
  assert.equal(out.pullRequests[0].checks.details.length, 0);
  assert.equal(out.pullRequests[0].title.length, 120);
  assert(!JSON.stringify(out).includes('PRIVATE'));
  assert(!out.pullRequests[0].title.includes('\n'));
});
test('PR status paginates inventories and explicitly reports a bounded incomplete inventory', async () => {
  const { githubStatus } = await import('../../scripts/github-status.mjs');
  let requests = [];
  const run = (file, args, options) => {
    const variables = JSON.parse(options.input).variables;
    requests.push(variables);
    return variables.after
      ? result([pr(2)], 2)
      : result([pr(1)], 2, true, 'next');
  };
  assert.equal(githubStatus({ repo: 'fixture/repo', run }).shown, 2);
  assert.deepEqual(
    requests.map((v) => v.after),
    [null, 'next'],
  );
  requests = [];
  const limited = githubStatus({ repo: 'fixture/repo', limit: 1, run });
  assert.equal(limited.complete, false);
  assert.equal(limited.total, 2);
  assert.equal(limited.shown, 1);
  assert.equal(requests[0].first, 1);
});
test('missing, stale, unknown or partial checks are never reported passed and unresolved reviews remain visible', async () => {
  const { githubStatus } = await import('../../scripts/github-status.mjs');
  const items = Array.from({ length: 8 }, (_, i) => pr(i + 1));
  items[0].commits.nodes[0].commit.statusCheckRollup = null;
  items[1].commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [check()];
  items[1].commits.nodes[0].commit.oid = 'b'.repeat(40);
  items[2].commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [
    check('COMPLETED', 'NEW_UNKNOWN'),
  ];
  items[3].commits.nodes[0].commit.statusCheckRollup.contexts = {
    nodes: [check()],
    pageInfo: { hasNextPage: true },
  };
  items[4].commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [
    check('IN_PROGRESS', null),
  ];
  items[5].commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [
    check('COMPLETED', 'FAILURE'),
  ];
  items[6].commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [
    check('COMPLETED', 'SKIPPED'),
  ];
  items[7].commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [
    {
      __typename: 'StatusContext',
      context: 'legacy',
      state: 'ERROR',
      targetUrl: null,
    },
  ];
  items[7].reviewThreads = {
    nodes: [{ isResolved: false }],
    pageInfo: { hasNextPage: true },
  };
  const out = githubStatus({ repo: 'fixture/repo', run: () => result(items) });
  assert.deepEqual(
    out.pullRequests.map((item) => item.checks.state),
    [
      'none',
      'unknown',
      'unknown',
      'unknown',
      'pending',
      'failed',
      'skipped',
      'failed',
    ],
  );
  assert.equal(out.pullRequests[7].reviews.unresolvedThreads, 1);
  assert.equal(out.pullRequests[7].reviews.complete, false);
});
test('PR status validates remote, bounds, API errors, response schema and pagination', async () => {
  const { githubStatus } = await import('../../scripts/github-status.mjs');
  const args = [];
  const out = githubStatus({
    run: (file) => {
      args.push(file);
      return file === 'git' ? 'git@github.com:fixture/repo.git\n' : result([]);
    },
  });
  assert.equal(out.repository, 'fixture/repo');
  assert.deepEqual(args, ['git', 'gh']);
  for (const limit of [0, -1, 501, NaN])
    assert.throws(() => githubStatus({ repo: 'fixture/repo', limit }));
  assert.throws(
    () =>
      githubStatus({
        repo: 'bad; shell',
        run: () => {
          throw Error('Should not run');
        },
      }),
    /owner\/repository/,
  );
  for (const raw of [
    'not JSON',
    '{}',
    '{"errors":["PRIVATE"]}',
    result([], 1, true, 'next'),
  ])
    assert.throws(() => githubStatus({ repo: 'fixture/repo', run: () => raw }));
  let call = 0;
  assert.throws(
    () =>
      githubStatus({
        repo: 'fixture/repo',
        run: () =>
          ++call === 1 ? result([pr()], 2, true, 'next') : result([pr()], 2),
      }),
    /inventory changed/,
  );
});
