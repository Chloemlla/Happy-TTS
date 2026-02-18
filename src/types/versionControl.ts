/**
 * 版本控制类型定义
 * Version Control Type Definitions
 */

import type { ProjectContent } from "./workspace";

// 版本接口
export interface Version {
  id: string;
  projectId: string;
  versionNumber: number;
  snapshot: ProjectContent;
  authorId: string;
  changeSummary: string;
  createdAt: Date;
}

// 版本差异接口
export interface VersionDiff {
  textChanges: TextChange[];
  configChanges: ConfigChange[];
}

// 文本变更接口
export interface TextChange {
  type: "added" | "removed" | "modified";
  lineNumber: number;
  oldText?: string;
  newText?: string;
}

// 配置变更接口
export interface ConfigChange {
  key: string;
  oldValue: any;
  newValue: any;
}

// 版本比较结果接口
export interface VersionComparisonResult {
  version1: Version;
  version2: Version;
  diff: VersionDiff;
  summary: string;
}

// 版本恢复结果接口
export interface VersionRestoreResult {
  success: boolean;
  newVersion: Version;
  message: string;
}
