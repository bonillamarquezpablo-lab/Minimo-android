import fs from 'node:fs';

const reportPath = 'artifacts/explorer-patrol/report.json';
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const branch = process.env.PATROL_STATUS_BRANCH || 'inspector-status';
if (!token || !repository) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required to publish Inspector data.');

const api = 'https://api.github.com/repos/' + repository + '/contents/';
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: 'Bearer ' + token,
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json'
};
async function put(relativePath, content, message) {
  const endpoint = api + relativePath.split('/').map(encodeURIComponent).join('/');
  const lookup = await fetch(endpoint + '?ref=' + encodeURIComponent(branch), { headers, cache: 'no-store' });
  let sha;
  if (lookup.ok) sha = (await lookup.json()).sha || null;
  else if (lookup.status !== 404) throw new Error('Could not read ' + relativePath + ': HTTP ' + lookup.status);
  const body = {
    message, branch,
    content: Buffer.from(content, 'utf8').toString('base64')
  };
  if (sha) body.sha = sha;
  const response = await fetch(endpoint, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error('Could not publish ' + relativePath + ': HTTP ' + response.status + ' ' + (await response.text()).slice(0, 500));
  const saved = await response.json();
  console.log('[EXPLORER_PATROL_PUBLISHED] ' + relativePath + ' commit=' + (saved.commit?.sha || 'unknown'));
}
const serialized = JSON.stringify(report, null, 2) + '\n';
const latestPath = 'inspector/data/explorer-patrol/latest.json';
const latestUrl = api + latestPath.split('/').map(encodeURIComponent).join('/');
const existingResponse = await fetch(latestUrl + '?ref=' + encodeURIComponent(branch), { headers, cache: 'no-store' });
let existingRunId = null;
if (existingResponse.ok) {
  const existingFile = await existingResponse.json();
  try {
    const existingReport = JSON.parse(Buffer.from(existingFile.content || '', 'base64').toString('utf8'));
    const parsed = Number(existingReport?.run?.id);
    if (Number.isSafeInteger(parsed) && parsed >= 0) existingRunId = parsed;
  } catch (_) {}
} else if (existingResponse.status !== 404) {
  throw new Error('Could not check the existing latest patrol: HTTP ' + existingResponse.status);
}
const candidateRunId = Number(report.run?.id);
if (existingRunId === null || !Number.isSafeInteger(candidateRunId) || candidateRunId >= existingRunId) {
  await put(latestPath, serialized, 'Publish latest Level 1 explorer patrol');
} else {
  console.log('[EXPLORER_PATROL_PUBLISHED] latest.json not overwritten by older run ' + candidateRunId + '; current is ' + existingRunId);
}
if (process.env.GITHUB_RUN_ID) {
  await put('inspector/data/explorer-patrol/runs/' + process.env.GITHUB_RUN_ID + '.json', serialized, 'Archive Level 1 explorer patrol ' + process.env.GITHUB_RUN_ID);
}
