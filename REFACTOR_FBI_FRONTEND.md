# FBI通缉犯前端优化方案

## 问题1: FBIWanted接口定义重复

**问题位置:**
- `FBIWantedManager.tsx` 第10-43行
- `FBIWantedPublic.tsx` 第27-60行

两个组件定义了完全相同的接口，违反DRY原则。

**解决方案:**

```typescript
// src/types/fbi.ts (新建文件)
export interface FBIWanted {
  _id: string;
  name: string;
  aliases: string[];
  age: number;
  height: string;
  weight: string;
  eyes: string;
  hair: string;
  race: string;
  nationality: string;
  dateOfBirth: string;
  placeOfBirth: string;
  charges: string[];
  description: string;
  reward: number;
  photoUrl: string;
  fingerprints: string[];
  lastKnownLocation: string;
  dangerLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  status: 'ACTIVE' | 'CAPTURED' | 'DECEASED' | 'REMOVED';
  dateAdded: string;
  lastUpdated: string;
  fbiNumber: string;
  ncicNumber: string;
  occupation: string;
  scarsAndMarks: string[];
  languages: string[];
  caution: string;
  remarks: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FBIStatistics {
  total: number;
  active: number;
  captured: number;
  deceased: number;
  dangerLevels: Record<string, number>;
  recentAdded: Array<{
    name: string;
    fbiNumber: string;
    dateAdded: string;
    dangerLevel: string;
  }>;
}

export interface FBIApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
```

然后在两个组件中：
```typescript
import { FBIWanted, FBIStatistics, FBIApiResponse } from '../types/fbi';
```

## 问题2: 图片缓存逻辑重复

**问题位置:**
- `FBIWantedPublic.tsx` 第78-111行定义了图片缓存函数
- 这些函数应该是可复用的工具函数

**解决方案:**

```typescript
// src/utils/imageCache.ts (新建文件)
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface ImageCacheDB extends DBSchema {
  images: {
    key: string;
    value: {
      id: string;
      hash: string;
      blob: Blob;
      timestamp: number;
    };
  };
}

const DB_NAME = 'ImageCache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7天

class ImageCacheService {
  private db: IDBPDatabase<ImageCacheDB> | null = null;

  async getDB(): Promise<IDBPDatabase<ImageCacheDB>> {
    if (this.db) return this.db;

    this.db = await openDB<ImageCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });

    return this.db;
  }

  async get(imageId: string, imageHash: string): Promise<string | null> {
    try {
      const db = await this.getDB();
      const cached = await db.get(STORE_NAME, imageId);

      if (!cached) return null;

      // 检查哈希值和缓存时间
      if (cached.hash !== imageHash) {
        await this.delete(imageId); // 哈希不匹配，删除旧缓存
        return null;
      }

      const age = Date.now() - cached.timestamp;
      if (age > MAX_CACHE_AGE) {
        await this.delete(imageId); // 缓存过期，删除
        return null;
      }

      return URL.createObjectURL(cached.blob);
    } catch (error) {
      console.warn('获取缓存图片失败:', error);
      return null;
    }
  }

  async set(imageId: string, imageHash: string, blob: Blob): Promise<void> {
    try {
      const db = await this.getDB();
      await db.put(STORE_NAME, {
        id: imageId,
        hash: imageHash,
        blob,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.warn('缓存图片失败:', error);
    }
  }

  async delete(imageId: string): Promise<void> {
    try {
      const db = await this.getDB();
      await db.delete(STORE_NAME, imageId);
    } catch (error) {
      console.warn('删除缓存图片失败:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      await db.clear(STORE_NAME);
    } catch (error) {
      console.warn('清空图片缓存失败:', error);
    }
  }

  async cleanExpired(): Promise<number> {
    try {
      const db = await this.getDB();
      const allImages = await db.getAll(STORE_NAME);
      const now = Date.now();
      let deletedCount = 0;

      for (const image of allImages) {
        if (now - image.timestamp > MAX_CACHE_AGE) {
          await db.delete(STORE_NAME, image.id);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.warn('清理过期缓存失败:', error);
      return 0;
    }
  }
}

export const imageCacheService = new ImageCacheService();
```

使用方式：
```typescript
import { imageCacheService } from '../utils/imageCache';

// 获取缓存
const cachedUrl = await imageCacheService.get(imageId, imageHash);

// 设置缓存
await imageCacheService.set(imageId, imageHash, blob);

// 清理过期缓存（可在应用启动时调用）
await imageCacheService.cleanExpired();
```

## 问题3: API调用未统一管理

**问题位置:**
- `FBIWantedManager.tsx` 第92-120行直接使用fetch
- `FBIWantedPublic.tsx` 类似的API调用模式

**解决方案:**

```typescript
// src/api/fbi.ts (新建文件)
import { FBIWanted, FBIStatistics, FBIApiResponse } from '../types/fbi';
import getApiBaseUrl from './index';

const API_BASE = getApiBaseUrl();

class FBIWantedAPI {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<FBIApiResponse<T>> {
    const token = localStorage.getItem('authToken');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '请求失败' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // 公开API
  async getPublicList(params: {
    page?: number;
    limit?: number;
    status?: string;
    dangerLevel?: string;
    search?: string;
  }): Promise<FBIApiResponse<FBIWanted[]>> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    return this.request(`/api/fbi-wanted/public/list?${queryParams}`);
  }

  async getPublicById(id: string): Promise<FBIApiResponse<FBIWanted>> {
    return this.request(`/api/fbi-wanted/public/${id}`);
  }

  async getPublicStatistics(): Promise<FBIApiResponse<FBIStatistics>> {
    return this.request('/api/fbi-wanted/public/statistics');
  }

  // 管理员API
  async getList(params: {
    page?: number;
    limit?: number;
    status?: string;
    dangerLevel?: string;
    search?: string;
  }): Promise<FBIApiResponse<FBIWanted[]>> {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        queryParams.append(key, String(value));
      }
    });

    return this.request(`/api/fbi-wanted?${queryParams}`);
  }

  async getById(id: string): Promise<FBIApiResponse<FBIWanted>> {
    return this.request(`/api/fbi-wanted/${id}`);
  }

  async create(data: Partial<FBIWanted>): Promise<FBIApiResponse<FBIWanted>> {
    return this.request('/api/fbi-wanted', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update(id: string, data: Partial<FBIWanted>): Promise<FBIApiResponse<FBIWanted>> {
    return this.request(`/api/fbi-wanted/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async updateStatus(id: string, status: string): Promise<FBIApiResponse<FBIWanted>> {
    return this.request(`/api/fbi-wanted/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async delete(id: string): Promise<FBIApiResponse<void>> {
    return this.request(`/api/fbi-wanted/${id}`, {
      method: 'DELETE',
    });
  }

  async batchDelete(ids: string[]): Promise<FBIApiResponse<void>> {
    return this.request('/api/fbi-wanted/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  }

  async uploadPhoto(id: string, file: File): Promise<FBIApiResponse<FBIWanted>> {
    const formData = new FormData();
    formData.append('photo', file);

    const token = localStorage.getItem('authToken');
    const response = await fetch(`${API_BASE}/api/fbi-wanted/${id}/photo`, {
      method: 'PATCH',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: '上传失败' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getStatistics(): Promise<FBIApiResponse<FBIStatistics>> {
    return this.request('/api/fbi-wanted/statistics');
  }
}

export const fbiAPI = new FBIWantedAPI();
```

使用示例：
```typescript
// 在组件中
import { fbiAPI } from '../api/fbi';

// 获取公开列表
const response = await fbiAPI.getPublicList({
  page: 1,
  limit: 20,
  status: 'ACTIVE'
});

// 创建记录（管理员）
const newWanted = await fbiAPI.create({
  name: 'John Doe',
  charges: ['Murder'],
  reward: 50000
});
```

## 问题4: 性能优化建议

### 4.1 使用React.memo避免不必要的重渲染

```typescript
// 卡片组件应该被memoized
const WantedCard = React.memo<{ wanted: FBIWanted; onClick: (id: string) => void }>(
  ({ wanted, onClick }) => {
    return (
      <motion.div
        onClick={() => onClick(wanted._id)}
        // ... rest of the card
      >
        {/* card content */}
      </motion.div>
    );
  },
  (prevProps, nextProps) => {
    // 自定义比较函数
    return prevProps.wanted._id === nextProps.wanted._id &&
           prevProps.wanted.lastUpdated === nextProps.wanted.lastUpdated;
  }
);
```

### 4.2 使用虚拟滚动优化长列表

```typescript
import { FixedSizeList as List } from 'react-window';

// 在FBIWantedManager或FBIWantedPublic中
<List
  height={600}
  itemCount={wantedList.length}
  itemSize={200}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <WantedCard wanted={wantedList[index]} onClick={handleClick} />
    </div>
  )}
</List>
```

### 4.3 图片懒加载

```typescript
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

<LazyLoadImage
  src={wanted.photoUrl}
  alt={wanted.name}
  effect="blur"
  placeholderSrc="/placeholder-avatar.jpg"
  onError={(e) => {
    e.currentTarget.src = '/default-avatar.jpg';
  }}
/>
```

### 4.4 防抖搜索

```typescript
import { useMemo } from 'react';
import debounce from 'lodash/debounce';

const FBIWantedPublic = () => {
  const [searchTerm, setSearchTerm] = useState('');

  // 防抖搜索函数
  const debouncedSearch = useMemo(
    () =>
      debounce(async (term: string) => {
        await fetchWantedList(term);
      }, 500),
    []
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedSearch(value);
  };

  // 清理
  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  return (
    <input
      value={searchTerm}
      onChange={handleSearchChange}
      placeholder="搜索通缉犯..."
    />
  );
};
```

## 需要安装的依赖

```bash
npm install react-window
npm install react-lazy-load-image-component
npm install lodash
npm install --save-dev @types/lodash
```

## 文件结构建议

```
frontend/src/
├── api/
│   └── fbi.ts                    # FBI API统一管理
├── types/
│   └── fbi.ts                    # FBI类型定义
├── utils/
│   └── imageCache.ts             # 图片缓存工具
├── hooks/
│   └── useFBIWanted.ts           # 自定义Hook（可选）
└── components/
    ├── FBIWantedManager.tsx      # 管理员界面
    ├── FBIWantedPublic.tsx       # 公开界面
    └── FBI/                      # FBI相关子组件
        ├── WantedCard.tsx
        ├── WantedDetail.tsx
        ├── WantedFilter.tsx
        └── WantedStatistics.tsx
```

## 优势总结

1. **代码复用**: 消除重复代码，提高可维护性
2. **类型安全**: 统一的类型定义避免类型错误
3. **性能优化**: memo、虚拟滚动、懒加载提升性能
4. **API管理**: 统一的API层便于维护和测试
5. **缓存优化**: 改进的缓存策略减少网络请求
6. **组件化**: 细分组件便于复用和测试
