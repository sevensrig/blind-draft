import axe from 'axe-core';
import type { AxeResults, Result } from 'axe-core';

/**
 * axe-core for the component tests.
 *
 * These run in real Chromium via Vitest browser mode, so axe gets genuine
 * computed styles and layout — the same engine the Playwright E2E scans use.
 * Testing components in isolation catches a problem at the component that owns
 * it, rather than only once it's assembled into a route.
 */

/** The rule sets worth enforcing on an isolated component. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function findViolations(container: Element = document.body): Promise<Result[]> {
	const results: AxeResults = await axe.run(container, {
		runOnly: { type: 'tag', values: TAGS },
		/*
		 * A component rendered on its own is legitimately not a whole page, so the
		 * document-scoped rules would fire on every single test with nothing
		 * actionable behind them. Full-page structure is asserted by the Playwright
		 * a11y suite instead, where it actually applies.
		 */
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

/**
 * Turns violations into something readable in a test failure. Includes each
 * offending node's markup and axe's own summary, so a failure is actionable
 * without re-running anything by hand.
 */
export function describeViolations(violations: Result[]): string {
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
