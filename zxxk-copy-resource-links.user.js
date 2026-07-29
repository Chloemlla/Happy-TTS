// ==UserScript==
// @name         zxxk 资源篮一键复制链接
// @namespace    https://cart.zxxk.com/
// @version      1.1.0
// @description  在资源篮中添加一键复制全部资源链接按钮
// @match        http://cart.zxxk.com/*
// @match        https://cart.zxxk.com/*
// @run-at       document-start
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_CLASS = 'zxxk-copy-resource-links';
    const LINK_PATTERN = /(?:https?:\/\/)?(?:www\.)?zxxk\.com\/soft\/(\d+)(?:\.html)?/i;
    const ID_PATTERN = /\/soft\/(\d+)(?:\.html)?/i;

    function addStyle() {
        const css = `
            .${BUTTON_CLASS} {
                display: inline-block !important;
                visibility: visible !important;
                position: relative !important;
                z-index: 2147483647 !important;
                margin-left: 12px !important;
                padding: 6px 13px !important;
                border: 0 !important;
                border-radius: 4px !important;
                background: #1677ff !important;
                color: #fff !important;
                cursor: pointer !important;
                font: 14px/1.5 Arial, sans-serif !important;
                opacity: 1 !important;
            }

            .${BUTTON_CLASS}:hover { background: #4096ff !important; }
            .${BUTTON_CLASS}:disabled { background: #999 !important; cursor: wait !important; }
            .zxxk-copy-resource-links-fixed {
                position: fixed !important;
                right: 24px !important;
                bottom: 24px !important;
                margin: 0 !important;
                box-shadow: 0 3px 12px rgba(0, 0, 0, .25) !important;
            }
        `;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.textContent = css;
            (document.head || document.documentElement).appendChild(style);
        }
    }

    function getResourceId(element) {
        if (!(element instanceof HTMLElement)) return null;

        const values = [
            element.getAttribute('data-resource-id'),
            element.getAttribute('data-resourceid'),
            element.getAttribute('data-catalog-id'),
            element.getAttribute('data-catalogid'),
            element.getAttribute('data-id'),
            ...Object.values(element.dataset || {})
        ];

        return values.find((value) => value && /^\d+$/.test(value)) || null;
    }

    function collectLinks(root) {
        const result = [];
        const seen = new Set();

        root.querySelectorAll('a[href], [data-resource-id], [data-resourceid], [data-catalog-id], [data-catalogid], [data-id]')
            .forEach((element) => {
                let id = getResourceId(element);

                if (element instanceof HTMLAnchorElement) {
                    const match = element.href.match(ID_PATTERN) || element.getAttribute('href')?.match(ID_PATTERN);
                    if (match) id = match[1];
                }

                if (id && !seen.has(id)) {
                    seen.add(id);
                    result.push(`https://www.zxxk.com/soft/${id}.html`);
                }
            });

        return result;
    }

    function getLinks() {
        const allLinks = collectLinks(document.body || document.documentElement);
        if (allLinks.length) return allLinks;

        // 某些页面把资源 ID 写在元素文本或属性中，作为最后的兼容处理。
        const text = document.body?.innerText || '';
        const result = [];
        const seen = new Set();
        const matches = text.matchAll(/(?:资源|soft)[^\d]{0,30}(\d{5,})/gi);

        for (const match of matches) {
            const id = match[1];
            if (!seen.has(id)) {
                seen.add(id);
                result.push(`https://www.zxxk.com/soft/${id}.html`);
            }
        }

        return result;
    }

    function copyText(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            return Promise.resolve();
        }

        if (navigator.clipboard?.writeText) {
            return navigator.clipboard.writeText(text);
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();

        return copied ? Promise.resolve() : Promise.reject(new Error('无法访问剪贴板'));
    }

    function makeButton(fixed = false) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `${BUTTON_CLASS}${fixed ? ' zxxk-copy-resource-links-fixed' : ''}`;
        button.textContent = '复制全部资源链接';
        button.title = '复制资源篮中的全部资源链接';

        button.addEventListener('click', async () => {
            const originalText = button.textContent;
            button.disabled = true;
            button.textContent = '正在整理…';

            try {
                const links = getLinks();
                if (!links.length) {
                    throw new Error('没有找到资源链接。请确认资源篮内容已经加载完成后再试。');
                }

                await copyText(links.join('\n'));
                button.textContent = `已复制 ${links.length} 条`;
            } catch (error) {
                console.error('[zxxk-copy-resource-links]', error);
                alert(error.message || '复制失败');
                button.textContent = originalText;
            } finally {
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                }, 1800);
            }
        });

        return button;
    }

    function mount() {
        if (!document.body) return;

        const title = document.querySelector('.resource-basket-title');
        if (title && !title.querySelector(`.${BUTTON_CLASS}`)) {
            title.appendChild(makeButton());
        }

        // 标题选择器变化或页面由前端框架重绘时，固定按钮仍然可用。
        if (!document.querySelector('.zxxk-copy-resource-links-fixed')) {
            document.body.appendChild(makeButton(true));
        }
    }

    function start() {
        addStyle();
        mount();

        const observer = new MutationObserver(mount);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.setInterval(mount, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
