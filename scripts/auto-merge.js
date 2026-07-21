#!/usr/bin/env node
"use strict";

const AUTO_MERGE_LABEL = process.env.AUTO_MERGE_LABEL || "automerge";
const ACCEPTED_CHECK_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const ACCEPTED_STATUS_STATES = new Set(["SUCCESS"]);

// In-repo baseline when repository rulesets/branch protection are not readable.
// Administrators should still configure these as required status checks in GitHub settings.
const BASELINE_REQUIRED_CHECKS = [
  "Node verification",
  "Rust verification",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeSha(value) {
  const sha = `${value || ""}`.trim().toLowerCase();
  assert(/^[0-9a-f]{40}$/.test(sha), `Invalid or missing 40-character head SHA: ${value || "<empty>"}`);
  return sha;
}

function latestReviewsByAuthor(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    const login = review.user?.login;
    if (!login) continue;
    const previous = latest.get(login);
    if (!previous || Number(review.id) > Number(previous.id)) {
      latest.set(login, review);
    }
  }
  return latest;
}

function requiredContextsFromRules(rules) {
  const contexts = new Set();
  for (const rule of rules || []) {
    if (rule.type !== "required_status_checks") continue;
    for (const check of rule.parameters?.required_status_checks || []) {
      if (check.context) contexts.add(check.context);
    }
  }
  return contexts;
}

function successfulContextNames(contexts) {
  const successful = new Set();
  const incomplete = [];

  for (const item of contexts) {
    if (item.__typename === "CheckRun") {
      if (item.status === "COMPLETED" && ACCEPTED_CHECK_CONCLUSIONS.has(item.conclusion)) {
        successful.add(item.name);
      } else {
        incomplete.push(`${item.name} (${item.status}/${item.conclusion || "none"})`);
      }
      continue;
    }

    if (item.__typename === "StatusContext") {
      if (ACCEPTED_STATUS_STATES.has(item.state)) {
        successful.add(item.context);
      } else {
        incomplete.push(`${item.context} (${item.state})`);
      }
    }
  }

  return { successful, incomplete };
}

async function loadPullRequestState(github, owner, repo, pullNumber) {
  const query = `
    query($owner: String!, $repo: String!, $pullNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pullNumber) {
          headRefOid
          mergeable
          mergeStateStatus
          reviewDecision
          statusCheckRollup {
            state
            contexts(first: 100) {
              pageInfo { hasNextPage }
              nodes {
                __typename
                ... on CheckRun { name status conclusion }
                ... on StatusContext { context state }
              }
            }
          }
        }
      }
    }
  `;

  const data = await github.graphql(query, { owner, repo, pullNumber });
  return data.repository?.pullRequest;
}

async function listReviews(github, owner, repo, pullNumber) {
  return github.paginate(github.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });
}

async function resolveRequiredContexts(github, core, owner, repo, branch) {
  const contexts = new Set();
  const sources = [];

  try {
    const response = await github.request("GET /repos/{owner}/{repo}/rules/branches/{branch}", {
      owner,
      repo,
      branch,
    });
    for (const name of requiredContextsFromRules(response.data || [])) {
      contexts.add(name);
    }
    if (contexts.size > 0) {
      sources.push("repository ruleset");
    }
  } catch (error) {
    core.warning(`Could not read repository rules for ${branch}: ${error.message}`);
  }

  try {
    const { data } = await github.rest.repos.getBranchProtection({ owner, repo, branch });
    for (const name of data.required_status_checks?.contexts || []) {
      contexts.add(name);
    }
    for (const check of data.required_status_checks?.checks || []) {
      if (check.context) contexts.add(check.context);
    }
    if ((data.required_status_checks?.contexts || []).length > 0 || (data.required_status_checks?.checks || []).length > 0) {
      sources.push("branch protection");
    }
  } catch (error) {
    core.warning(`Could not read classic branch protection for ${branch}: ${error.message}`);
  }

  if (contexts.size === 0) {
    for (const name of BASELINE_REQUIRED_CHECKS) {
      contexts.add(name);
    }
    sources.push("in-repo baseline");
    core.warning(
      `No required checks found in ruleset/branch protection for ${branch}; enforcing in-repo baseline: ${BASELINE_REQUIRED_CHECKS.join(", ")}`
    );
  } else {
    core.info(`Required checks resolved from ${sources.join(" + ")}: ${[...contexts].join(", ")}`);
  }

  return contexts;
}

async function findOpenPullsForHeadSha(github, owner, repo, headSha) {
  const pulls = await github.paginate(github.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    per_page: 100,
  });
  return pulls.filter((pr) => `${pr.head.sha || ""}`.toLowerCase() === headSha);
}

function softSkip(core, message) {
  core.warning(message);
  return null;
}

async function evaluatePullRequest({ github, core, owner, repo, pullNumber, expectedHeadSha }) {
  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: pullNumber });

  // Expected non-merge conditions: soft-skip so workflow_run noise does not fail Actions.
  if (pr.state !== "open") {
    return softSkip(core, `PR #${pullNumber} is not open; skipping auto-merge.`);
  }
  if (pr.draft) {
    return softSkip(core, `PR #${pullNumber} is a draft; skipping auto-merge.`);
  }
  assert(pr.base.repo?.full_name === `${owner}/${repo}`, `PR #${pullNumber} targets a different repository.`);
  if (!pr.labels.some((label) => label.name === AUTO_MERGE_LABEL)) {
    return softSkip(core, `PR #${pullNumber} lacks the required ${AUTO_MERGE_LABEL} label; skipping auto-merge.`);
  }

  const currentHeadSha = normalizeSha(pr.head.sha);
  // Head race is fail-closed: never merge a different SHA than the triggering run validated.
  assert(
    currentHeadSha === expectedHeadSha,
    `PR #${pullNumber} head changed: expected ${expectedHeadSha}, found ${currentHeadSha}.`
  );

  const reviews = latestReviewsByAuthor(await listReviews(github, owner, repo, pullNumber));
  const blockingReviews = [...reviews.values()].filter((review) => review.state === "CHANGES_REQUESTED");
  if (blockingReviews.length > 0) {
    return softSkip(core, `PR #${pullNumber} has an active changes-requested review; skipping auto-merge.`);
  }

  const currentApprovals = [...reviews.values()].filter((review) => {
    const login = review.user?.login || "";
    return (
      review.state === "APPROVED" &&
      `${review.commit_id || ""}`.toLowerCase() === currentHeadSha &&
      login !== pr.user?.login &&
      review.user?.type !== "Bot" &&
      !login.endsWith("[bot]")
    );
  });
  if (currentApprovals.length === 0) {
    return softSkip(
      core,
      `PR #${pullNumber} has no human approval for current head ${currentHeadSha}; skipping auto-merge.`
    );
  }

  const requiredContexts = await resolveRequiredContexts(github, core, owner, repo, pr.base.ref);
  assert(requiredContexts.size > 0, `No required status checks available for ${pr.base.ref}.`);

  const state = await loadPullRequestState(github, owner, repo, pullNumber);
  assert(state, `Unable to load GraphQL state for PR #${pullNumber}.`);
  assert(
    normalizeSha(state.headRefOid) === currentHeadSha,
    `PR #${pullNumber} GraphQL head SHA does not match REST head SHA.`
  );
  if (state.mergeable !== "MERGEABLE") {
    return softSkip(core, `PR #${pullNumber} is not mergeable (${state.mergeable}); skipping auto-merge.`);
  }
  if (state.mergeStateStatus !== "CLEAN") {
    return softSkip(
      core,
      `PR #${pullNumber} does not satisfy repository merge requirements (${state.mergeStateStatus}); skipping auto-merge.`
    );
  }
  if (state.reviewDecision === "CHANGES_REQUESTED") {
    return softSkip(core, `PR #${pullNumber} has a blocking review decision; skipping auto-merge.`);
  }
  if (!state.statusCheckRollup) {
    return softSkip(core, `PR #${pullNumber} has no status check rollup; skipping auto-merge.`);
  }
  assert(
    !state.statusCheckRollup.contexts.pageInfo.hasNextPage,
    `PR #${pullNumber} has more than 100 check contexts; refusing incomplete evaluation.`
  );
  if (state.statusCheckRollup.state !== "SUCCESS") {
    return softSkip(
      core,
      `PR #${pullNumber} check rollup is ${state.statusCheckRollup.state}; skipping auto-merge.`
    );
  }

  const contexts = state.statusCheckRollup.contexts.nodes || [];
  const { successful, incomplete } = successfulContextNames(contexts);
  if (incomplete.length > 0) {
    return softSkip(
      core,
      `PR #${pullNumber} has non-successful checks: ${incomplete.join(", ")}; skipping auto-merge.`
    );
  }

  const missingRequired = [...requiredContexts].filter((name) => !successful.has(name));
  if (missingRequired.length > 0) {
    return softSkip(
      core,
      `PR #${pullNumber} is missing successful required checks: ${missingRequired.join(", ")}; skipping auto-merge.`
    );
  }

  core.info(
    `PR #${pullNumber}: head ${currentHeadSha}, ${currentApprovals.length} current approval(s), required checks passed: ${[...requiredContexts].join(", ")}.`
  );
  return { pr, currentHeadSha };
}

module.exports = async function run({ github, context, core }) {
  const { owner, repo } = context.repo;
  const isManual = context.eventName === "workflow_dispatch";
  const workflowRun = context.payload.workflow_run;

  if (!isManual) {
    assert(workflowRun?.event === "pull_request", "Only pull_request workflow runs may trigger automatic merging.");
    assert(
      workflowRun?.conclusion === "success",
      `Triggering workflow did not succeed (${workflowRun?.conclusion || "unknown"}).`
    );
  }

  let candidates;
  if (isManual) {
    candidates = [{ number: Number(context.payload.inputs?.pr_number), headSha: context.payload.inputs?.head_sha }];
  } else {
    const headSha = normalizeSha(workflowRun.head_sha);
    const associated = (workflowRun.pull_requests || [])
      .map((pr) => Number(pr.number))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (associated.length > 0) {
      candidates = associated.map((number) => ({ number, headSha }));
    } else {
      const matched = await findOpenPullsForHeadSha(github, owner, repo, headSha);
      if (matched.length === 0) {
        core.warning(`No open PR found for head ${headSha}; the PR may have already been merged or closed. Skipping.`);
        return;
      }
      assert(matched.length === 1, `Expected exactly one open PR for head ${headSha}, found ${matched.length}.`);
      candidates = [{ number: matched[0].number, headSha }];
    }
  }

  assert(candidates.length === 1, `Expected exactly one associated pull request, found ${candidates.length}.`);
  const pullNumber = candidates[0].number;
  assert(Number.isInteger(pullNumber) && pullNumber > 0, "Invalid pull request number.");
  const expectedHeadSha = normalizeSha(candidates[0].headSha);

  const firstPass = await evaluatePullRequest({ github, core, owner, repo, pullNumber, expectedHeadSha });
  if (!firstPass) {
    return;
  }

  // Re-evaluate immediately before the merge and bind the merge API call to the same SHA.
  const secondPass = await evaluatePullRequest({
    github,
    core,
    owner,
    repo,
    pullNumber,
    expectedHeadSha,
  });
  if (!secondPass) {
    return;
  }

  const { pr, currentHeadSha } = secondPass;

  const result = await github.rest.pulls.merge({
    owner,
    repo,
    pull_number: pullNumber,
    sha: currentHeadSha,
    merge_method: "squash",
    commit_title: `${pr.title} (#${pullNumber})`,
    commit_message: `Automatically merged after current-head approval and required-check validation for ${currentHeadSha}.`,
  });

  assert(result.data.merged, `GitHub refused to merge PR #${pullNumber}: ${result.data.message || "unknown reason"}`);
  core.info(`Merged PR #${pullNumber} at ${currentHeadSha}.`);
};
