// ==UserScript==
// @name         zxxk 资源篮一键复制链接
// @namespace    https://cart.zxxk.com/
// @version      1.0.0
// @description  在资源篮标题右侧添加按钮，一键复制全部资源链接
// @match        https://cart.zxxk.com/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const LINK_PATTERN = /https?:\/\/(?:www\.)?zxxk\.com\/soft\/(\d+)(?:\.html)?/i;
    const ID_PATTERN = /\/soft\/(\d+)(?:\.html)?/i;

    GM_addStyle(`
        .zxxk-copy-resource-links {
            margin-left: 12px;
            padding: 5px 12px;
            border: 0;
            border-radius: 4px;
            background: #1677ff;
            color: #fff;
            cursor: pointer;
            font-size: 13px;
            line-height: 1.5;
        }

        .zxxk-copy-resource-links:hover {
            background: #4096ff;
        }

        .zxxk-copy-resource-links:disabled {
            background: #999;
            cursor: not-allowed;
        }
    `);

    function getResourceIdFromElement(element) {
        if (!(element instanceof HTMLElement)) {
            return null;
        }

        const attributes = [
            'data-resource-id',
            'data-resourceid',
            'data-id',
            'data-catalog-id',
            'data-catalogid'
        ];

        for (const attribute of attributes) {
            const value = element.getAttribute(attribute);
            if (value && /^\d+$/.test(value)) {
                return value;
            }
        }

        for (const value of Object.values(element.dataset || {})) {
            if (value && /^\d+$/.test(value)) {
                return value;
            }
        }

        return null;
    }

    function getLinksFromContainer(container) {
        const links = [];
        const seen = new Set();

        container.querySelectorAll(
            'a[href], [data-resource-id], [data-resourceid], [data-catalog-id]'
        ).forEach((element) => {
            let id = null;

            if (element instanceof HTMLAnchorElement) {
                const href = element.href || '';
                const match = href.match(ID_PATTERN);

                if (match) {
                    id = match[1];
                }
            }

            if (!id) {
                id = getResourceIdFromElement(element);
            }

            if (id && !seen.has(id)) {
                seen.add(id);
                links.push(`https://www.zxxk.com/soft/${id}.html`);
            }
        });

        return links;
    }

    function getSelectedResourceLinks() {
        const checkedInputs = Array.from(
            document.querySelectorAll(
                'input[type="checkbox"]:checked, input[type="radio"]:checked'
            )
        );

        const selectedLinks = [];
        const seen = new Set();

        for (const input of checkedInputs) {
            const row = input.closest(
                '[data-resource-id], [data-resourceid], [data-id], ' +
                '.resource-item, .basket-item, li, tr, .item'
            );

            if (!row) {
                continue;
            }

            for (const link of getLinksFromContainer(row)) {
                if (!seen.has(link)) {
                    seen.add(link);
                    selectedLinks.push(link);
                }
            }
        }

        return selectedLinks;
    }

    function getAllResourceLinks() {
        const links = [];
        const seen = new Set();

        document.querySelectorAll('a[href]').forEach((anchor) => {
            const href = anchor.href || '';
            const match = href.match(LINK_PATTERN);

            if (match) {
                const link = `https://www.zxxk.com/soft/${match[1]}.html`;

                if (!seen.has(link)) {
                    seen.add(link);
                    links.push(link);
                }
            }
        });

        if (links.length > 0) {
            return links;
        }

        return getLinksFromContainer(document.body);
    }

    async function copyText(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            return;
        }

        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();

        const copied = document.execCommand('copy');
        textarea.remove();

        if (!copied) {
            throw new Error('无法访问剪贴板');
        }
    }

    function createButton(titleElement) {
        if (titleElement.querySelector('.zxxk-copy-resource-links')) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'zxxk-copy-resource-links';
        button.textContent = '复制全部资源链接';
        button.title = '复制资源篮中的全部资源链接';

        button.addEventListener('click', async () => {
            button.disabled = true;
            const originalText = button.textContent;
            button.textContent = '正在整理…';

            try {
                // 页面存在勾选项时，优先复制勾选项；否则复制页面中的全部资源。
                const links = getSelectedResourceLinks();
                const finalLinks = links.length > 0 ? links : getAllResourceLinks();

                if (finalLinks.length === 0) {
                    throw new Error('没有找到资源链接');
                }

                await copyText(finalLinks.join('\n'));

                button.textContent = `已复制 ${finalLinks.length} 条`;
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                }, 1800);
            } catch (error) {
                console.error('[zxxk-copy-resource-links]', error);
                alert(error.message || '复制失败，请检查浏览器剪贴板权限');

                button.textContent = originalText;
                button.disabled = false;
            }
        });

        titleElement.appendChild(button);
    }

    function mountButton() {
        const titleElement = document.querySelector('.resource-basket-title');

        if (titleElement) {
            createButton(titleElement);
        }
    }

    mountButton();

    // 兼容 React/Vue 异步渲染或切换资源篮的情况。
    const observer = new MutationObserver(mountButton);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
