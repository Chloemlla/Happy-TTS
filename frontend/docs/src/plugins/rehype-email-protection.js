function rehypeEmailProtection(options = {}) {
	const { method = 'base64' } = options;

	const emailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

	function encodeEmail(email) {
		if (method !== 'base64') return email;
		return Buffer.from(email).toString('base64');
	}

	function isSkippableParent(ancestors) {
		if (!ancestors || ancestors.length === 0) return false;
		for (let i = ancestors.length - 1; i >= 0; i -= 1) {
			const node = ancestors[i];
			if (node && node.type === 'element' && (node.tagName === 'code' || node.tagName === 'pre')) {
				return true;
			}
		}
		return false;
	}

	function createEmailSpan(encoded) {
		return {
			type: 'element',
			tagName: 'span',
			properties: {
				className: ['email-protected'],
				'data-email': encoded,
			},
			children: [],
		};
	}

	function splitTextToNodes(text) {
		const nodes = [];
		let lastIndex = 0;
		let match;
		emailRegex.lastIndex = 0;
		// eslint-disable-next-line no-cond-assign
		while ((match = emailRegex.exec(text))) {
			const email = match[0];
			if (match.index > lastIndex) {
				nodes.push({ type: 'text', value: text.slice(lastIndex, match.index) });
			}
			nodes.push(createEmailSpan(encodeEmail(email)));
			lastIndex = match.index + email.length;
		}
		if (lastIndex < text.length) {
			nodes.push({ type: 'text', value: text.slice(lastIndex) });
		}
		return nodes;
	}

	function transformNode(node, ancestors) {
		if (!node) return;

		// For links: convert mailto
		if (node.type === 'element' && node.tagName === 'a') {
			const href = node.properties && node.properties.href;
			if (typeof href === 'string' && href.startsWith('mailto:')) {
				const email = href.replace(/^mailto:/i, '');
				const encoded = encodeEmail(email);
				node.properties = {
					...node.properties,
					href: '#',
					'data-email': encoded,
					className: Array.from(new Set([...(node.properties.className || []), 'email-protected'])),
				};
				node.children = [];
			}
			return;
		}

		if (node.type === 'text') {
			if (isSkippableParent(ancestors)) return;
			const text = node.value || '';
			if (!emailRegex.test(text)) return;
			const parent = ancestors[ancestors.length - 1];
			if (!parent || !parent.children) return;

			// Replace current text node with split nodes
			const index = parent.children.indexOf(node);
			if (index === -1) return;
			const replacement = splitTextToNodes(text);
			parent.children.splice(index, 1, ...replacement);
			return;
		}

		// Recurse children
		if (node.children && Array.isArray(node.children)) {
			for (let i = 0; i < node.children.length; i += 1) {
				const child = node.children[i];
				transformNode(child, [...ancestors, node]);
			}
		}
	}

	return function transformer(tree) {
		transformNode(tree, []);
	};
}

module.exports = rehypeEmailProtection; 