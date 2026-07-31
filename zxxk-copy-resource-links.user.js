(async () => {
  const API = 'https://downloadnew.zxxk.com/settle/get-payinfo-for-site';

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function getId(value) {
    if (value == null) return null;
    const text = String(value);

    // 匹配 /soft/9046329.html
    const urlMatch = text.match(/\/soft\/(\d+)(?:\.html)?/i);
    if (urlMatch) return urlMatch[1];

    // 匹配纯数字 ID
    if (/^\d+$/.test(text.trim())) {
      return text.trim();
    }

    return null;
  }

  function getTitle(element) {
    if (!element) return '';

    const titleAttributes = [
      'title',
      'data-title',
      'data-name',
      'data-resource-title',
      'data-resource-name'
    ];

    for (const attribute of titleAttributes) {
      const value = element.getAttribute?.(attribute)?.trim();
      if (value && !/^\d+$/.test(value)) {
        return value;
      }
    }

    const titleElement = element.querySelector?.(
      '[title], .title, .resource-title, .resource-name, ' +
      '.name, .resource-basket-item-title, a'
    );

    if (titleElement) {
      const value = (
        titleElement.getAttribute('title') ||
        titleElement.textContent ||
        ''
      ).trim();

      if (value && !/^\d+$/.test(value)) {
        return value.replace(/\s+/g, ' ');
      }
    }

    return '';
  }

  function collectFromDom() {
    const records = [];
    const seen = new Set();

    document.querySelectorAll(
      'a[href], [data-resource-id], [data-resourceid], ' +
      '[data-catalog-id], [data-catalogid], [data-id]'
    ).forEach((element) => {
      let id = null;

      if (element.matches?.('a[href]')) {
        id = getId(
          element.getAttribute('href') ||
          element.href
        );
      }

      const attributes = [
        'data-resource-id',
        'data-resourceid',
        'data-catalog-id',
        'data-catalogid',
        'data-id'
      ];

      if (!id) {
        for (const attribute of attributes) {
          id = getId(element.getAttribute(attribute));
          if (id) break;
        }
      }

      if (!id) return;

      // 优先在资源所在行/卡片中找标题
      const container = element.closest(
        '[data-resource-id], [data-resourceid], [data-catalog-id], ' +
        '[data-catalogid], [data-id], .resource-item, .basket-item, ' +
        '.resource-list-item, li, tr, .item'
      );

      const title = getTitle(container || element.parentElement);

      if (!seen.has(id)) {
        seen.add(id);
        records.push({ id, title });
      } else {
        const old = records.find((item) => item.id === id);
        if (old && !old.title && title) {
          old.title = title;
        }
      }
    });

    return records;
  }

  function findObjects(value, result = []) {
    if (!value || typeof value !== 'object') {
      return result;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => findObjects(item, result));
      return result;
    }

    result.push(value);

    Object.values(value).forEach((item) => {
      if (item && typeof item === 'object') {
        findObjects(item, result);
      }
    });

    return result;
  }

  function getApiRecords(data) {
    const records = [];
    const seen = new Set();

    for (const object of findObjects(data)) {
      const id =
        getId(object.resourceId) ||
        getId(object.resourceID) ||
        getId(object.resource_id) ||
        getId(object.catalogId) ||
        getId(object.catalogID) ||
        getId(object.catalog_id) ||
        getId(object.id);

      if (!id || seen.has(id)) continue;

      const title =
        object.title ||
        object.name ||
        object.resourceName ||
        object.resourceTitle ||
        object.catalogName ||
        object.catalogTitle ||
        '';

      seen.add(id);
      records.push({
        id,
        title: String(title || '').trim()
      });
    }

    return records;
  }

  const domRecords = collectFromDom();

  if (!domRecords.length) {
    console.warn('没有从当前页面找到资源 ID。请确认资源篮已经加载完成。');
    return;
  }

  const resourceIds = unique(domRecords.map((item) => item.id));

  const payload = {
    product: 1,
    albumId: 0,
    curl: location.href,
    downSource: 1,
    resourceIds: resourceIds.join(','),
    resourceType: 0,
    allocationType: 0,
    appId: '',
    clientInfo: {
      appType: 1,
      isCart: 1,
      needMultiPackage: 1,
      needDownloadUrl: true
    },
    catalogs: resourceIds.map((id) => ({ id: Number(id) }))
  };

  console.log(`正在请求 ${resourceIds.length} 个资源...`);

  let apiData = null;

  try {
    const response = await fetch(API, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`接口请求失败：HTTP ${response.status}`);
    }

    apiData = await response.json();
    console.log('接口返回数据：', apiData);
  } catch (error) {
    console.warn('接口请求失败，将使用页面中的资源 ID 和标题：', error);
  }

  const apiRecords = apiData ? getApiRecords(apiData) : [];
  const titleMap = new Map();

  // 页面标题优先
  domRecords.forEach((item) => {
    if (item.title) {
      titleMap.set(item.id, item.title);
    }
  });

  // 页面没有标题时使用接口标题
  apiRecords.forEach((item) => {
    if (!titleMap.has(item.id) && item.title) {
      titleMap.set(item.id, item.title);
    }
  });

  const lines = resourceIds.map((id) => {
    const title = titleMap.get(id) || `资源 ${id}`;
    const url = `https://www.zxxk.com/soft/${id}.html`;
    return `${title} ${url}`;
  });

  const output = lines.join('\n');

  try {
    await navigator.clipboard.writeText(output);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = output;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  console.log(`已复制 ${lines.length} 条资源链接：\n\n${output}`);
  alert(`已复制 ${lines.length} 条资源链接到剪贴板`);
})();
