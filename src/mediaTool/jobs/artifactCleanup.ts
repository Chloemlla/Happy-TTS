// 删除任务时清理它产出的文件。
//
// 保留入参文件(job.input.type=paths:用户上传的音频仍归用户,可再用来重跑),
// 其余一并删除:下载回来的媒体、txt/timed/srt/json 产物,以及续传 sidecar
// (成功时已清、取消/失败时还留在音频旁边,不在 result.files 里,按音频路径推)。
//
// 每条路径都必须解析回落进 workRoot(用户态再叠加限制在用户目录)内,
// 且只能是普通文件——越界或目录一律跳过,绝不递归删。
import fs from "node:fs";
import path from "node:path";
import { sessionSidecarPath } from "../lasrSession";
import { relInside, statOrNull } from "../runtime";
import type { MediaJobRecord } from "../types";

/** 返回实际删除的文件数。best-effort:单个文件删不掉不影响其余。 */
export function purgeJobArtifacts(job: MediaJobRecord, workRoot: string, restrictTo?: string): number {
  const inputs = (job.input.type === "paths" ? job.input.values : []).map(String);
  const keep = new Set(inputs);

  const candidates = new Set<string>(job.result?.files ?? []);
  const audios = new Set<string>(inputs);
  for (const item of job.result?.items ?? []) {
    for (const rel of [item.file, item.txtFile, item.timedFile, item.srtFile, item.jsonFile]) {
      if (rel) candidates.add(String(rel));
    }
    if (item.file) audios.add(String(item.file));
  }
  // 续传 sidecar 与音频同目录同名
  for (const audio of audios) candidates.add(sessionSidecarPath(audio));

  let removed = 0;
  for (const rel of candidates) {
    if (keep.has(rel)) continue;
    const abs = path.resolve(workRoot, rel);
    if (relInside(workRoot, abs) === null) continue;
    if (restrictTo && relInside(restrictTo, abs) === null) continue;
    const st = statOrNull(abs);
    if (!st || !st.isFile()) continue;
    try {
      fs.unlinkSync(abs);
      removed += 1;
    } catch {
      // 尽力而为:占用/权限问题留给运维,不阻断任务删除
    }
  }
  return removed;
}
