import axe from 'axe-core';
import type { AxeResults, Result } from 'axe-core';

/**
 * axe-core for the component tests. Real Chromium via Vitest browser mode, so
 * axe gets genuine computed styles — and a failure names the component that owns
 * it rather than the route it ended up in.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function findViolations(container: Element = document.body): Promise<Result[]> {
	const results: AxeResults = await axe.run(container, {
		runOnly: { type: 'tag', values: TAGS },
		// A component on its own isn't a page, so document-scoped rules would fire
		// on every test with nothing actionable behind them. The Playwright a11y
		// suite asserts full-page structure instead.
		rules: {
			'page-has-heading-one': { enabled: false },
			region: { enabled: false },
			'landmark-one-main': { enabled: false },
			'html-has-lang': { enabled: false },
			'document-title': { enabled: false }
		}
	});
	return results.violations;
}

/** Node markup plus axe's summary, so a failure is actionable as printed. */
function describeViolations(violations: Result[]): string {
	return violations
		.map((violation) => {
			const nodes = violation.nodes
				.map((node) => {
					const summary = (node.failureSummary ?? '').replace(/\n/g, '\n      ');
					return `    at ${node.target.join(' ')}\n      ${node.html}\n      ${summary}`;
				})
				.join('\n');
			return `${violation.id} (${violation.impact}): ${violation.help}\n${nodes}`;
		})
		.join('\n\n');
}

/** Asserts a container is clean, naming what broke if it isn't. */
export async function expectNoViolations(container: Element = document.body): Promise<void> {
	const violations = await findViolations(container);
	if (violations.length > 0) {
		throw new Error(
			`${violations.length} accessibility violation(s):\n${describeViolations(violations)}`
		);
	}
}
