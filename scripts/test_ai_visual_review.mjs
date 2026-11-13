import assert from 'node:assert/strict';
import { buildPrompt, validateReview } from './ai-visual-review.mjs';

const valid = validateReview({
  overallStatus: 'review-required',
  observations: [{
    severity: 'high',
    summary: 'Visible seam on the shoreline.',
    evidence: ['contact-sheet.png: north beach'],
    recommendation: 'Inspect the shoreline mesh continuity before editing.',
    confidence: 0.92
  }]
});
assert.equal(valid.status, 'completed');
assert.equal(valid.observations[0].severity, 'high');
assert.equal(valid.safety.codeChangesMade, false);
assert.throws(() => validateReview({ observations: [{ summary: '' }] }), /non-empty summary/);
assert.throws(() => validateReview([]), /JSON object/);
assert.throws(() => validateReview({ overallStatus: 'approved', observations: [] }), /unsupported overallStatus/);
assert.throws(() => validateReview({ observations: [{ severity: 'high', summary: 'A defect', evidence: [], recommendation: 'Inspect', confidence: 0.8 }] }), /at least one visible evidence location/);
assert.throws(() => validateReview({ observations: [{ severity: 'urgent', summary: 'A defect', evidence: ['scene.png'], recommendation: 'Inspect', confidence: 0.8 }] }), /unsupported severity/);
const prompt = buildPrompt({ project: 'EL SIN NOMBRE' });
assert.match(prompt, /untrusted data/);
assert.match(prompt, /Never recommend reducing resolution/);
assert.match(prompt, /13 islands/);
console.log('AI visual review contracts: PASS');
