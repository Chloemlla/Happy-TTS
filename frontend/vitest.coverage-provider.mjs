import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BaseCoverageProvider } from "vitest/node";

/**
 * 本文件的绝对文件系统路径。
 *
 * 不能直接把 import.meta.url 交给 createRequire：跑在 vitest 模块运行器里时，它会被 Vite
 * 改写成开发服务地址（实测 CI：http://localhost:3000/@fs/home/runner/.../package.json），
 * createRequire 只认 file: URL 或绝对路径，当场抛 ERR_INVALID_ARG_VALUE，
 * 表现为「Failed to load custom CoverageProviderModule」——覆盖率恒为 0%，
 * 所有 coverage 阈值判定失败（G13-02）。所以下面先把真实路径还原出来，再建 require 锥。
 */
function modulePath() {
  const url = typeof import.meta.url === "string" ? import.meta.url : "";

  if (url.startsWith("file://")) {
    try {
      return fileURLToPath(url);
    } catch {
      // 非标准 file: URL（例如带奇峴编码）交给后面的分支处理。
    }
  }

  const viaFsMarker = "/@fs/";
  const at = url.indexOf(viaFsMarker);
  if (at !== -1) {
    const sliced = decodeURIComponent(url.slice(at + viaFsMarker.length - 1).split("?")[0]);
    // Windows 上 Vite 会给出 /@fs/C:/... ，多出来的前导斜杠让 path.resolve 拼出错的相对位置。
    return sliced.replace(/^[/\\](?=[A-Za-z]:)/, "");
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    // 不带 /@fs 的开发服务 URL：剩下 pathname 部分就是绝对路径。
    try {
      return decodeURIComponent(new URL(url).pathname);
    } catch {
      // 交给 cwd 兼底。
    }
  }

  if (url && !url.includes("://")) {
    return url;
  }

  // 兼容兼底：仓库里该 provider 与 vitest.config.ts 同层，cwd 就是 frontend/。
  return resolve(process.cwd(), "vitest.coverage-provider.mjs");
}

const providerPath = modulePath();
const providerDir = dirname(providerPath);

const localRequire = createRequire(providerPath);
// 仓库根的 package.json：jest 系（带 istanbul-lib-* 那条链）装在根项目里，从这里往下找。
const rootRequire = createRequire(resolve(providerDir, "..", "package.json"));
const jestRequire = createRequire(rootRequire.resolve("jest/package.json"));
const jestCoreRequire = createRequire(jestRequire.resolve("@jest/core/package.json"));
const jestReportersRequire = createRequire(jestCoreRequire.resolve("@jest/reporters/package.json"));

const { createCoverageMap } = jestReportersRequire("istanbul-lib-coverage");
const { createInstrumenter } = jestReportersRequire("istanbul-lib-instrument");
const libReport = jestReportersRequire("istanbul-lib-report");
const libSourceMaps = jestReportersRequire("istanbul-lib-source-maps");
const reports = jestReportersRequire("istanbul-reports");
const { version: vitestVersion } = localRequire("vitest/package.json");

const coverageStoreKey = "__VITEST_COVERAGE__";

function withoutQuery(filename) {
  return filename.split("?")[0];
}

async function remapCoverage(coverageMap) {
  const sourceMapStore = libSourceMaps.createSourceMapStore();
  return sourceMapStore.transformCoverage(coverageMap);
}

class ExistingIstanbulCoverageProvider extends BaseCoverageProvider {
  // 非官方标识：避免 Vitest 4 按 name 去解析官方 @vitest/coverage-istanbul 包（该包不在依赖中）。
  // 本 provider 是仓库自带的 istanbul-lib-* 封装，解析到官方包会抛 “Cannot find package”。
  name = "repo-istanbul";
  version = vitestVersion;
  instrumenter;

  initialize(ctx) {
    this._initialize(ctx);
    this.instrumenter = createInstrumenter({
      produceSourceMap: true,
      autoWrap: false,
      esModules: true,
      compact: false,
      coverageVariable: coverageStoreKey,
      coverageGlobalScope: "globalThis",
      coverageGlobalScopeFunc: false,
      ignoreClassMethods: this.options.ignoreClassMethods,
    });
  }

  requiresTransform(id) {
    return this.isIncluded(withoutQuery(id));
  }

  onFileTransform(sourceCode, id, pluginContext) {
    const filename = withoutQuery(id);
    if (!this.isIncluded(filename)) return undefined;

    const sourceMap = pluginContext.getCombinedSourcemap?.();
    if (sourceMap?.sources) {
      sourceMap.sources = sourceMap.sources.map(withoutQuery);
    }

    const code = this.instrumenter.instrumentSync(sourceCode, filename, sourceMap || undefined);
    return {
      code,
      map: this.instrumenter.lastSourceMap(),
    };
  }

  createCoverageMap() {
    return createCoverageMap({});
  }

  async generateCoverage({ allTestsRun }) {
    let coverageMap = this.createCoverageMap();
    const debug = Object.assign(() => undefined, { enabled: false });

    await this.readCoverageFiles({
      onFileRead: (coverage) => coverageMap.merge(coverage),
      onFinished: async () => undefined,
      onDebug: debug,
    });

    if (this.options.include && (allTestsRun || !this.options.cleanOnRerun)) {
      const uncoveredFiles = await this.getUntestedFiles(coverageMap.files());
      const transform = this.createUncoveredFileTransformer(this.ctx);
      const cacheKey = Date.now();

      for (const [index, filename] of uncoveredFiles.entries()) {
        await transform(`${filename}?vitest-uncovered-coverage=true&cache=${cacheKey}-${index}`);
        const fileCoverage = this.instrumenter.lastFileCoverage();
        if (fileCoverage) coverageMap.addFileCoverage(fileCoverage);
      }
    }

    coverageMap = await remapCoverage(coverageMap);
    coverageMap.filter((filename) => {
      if (!existsSync(filename)) return false;
      return !this.options.excludeAfterRemap || this.isIncluded(filename);
    });
    return coverageMap;
  }

  async generateReports(coverageMap, allTestsRun) {
    const context = libReport.createContext({
      dir: this.options.reportsDirectory,
      coverageMap,
      watermarks: this.options.watermarks,
    });

    for (const [reporter, reporterOptions] of this.options.reporter) {
      reports
        .create(reporter, {
          skipFull: this.options.skipFull,
          projectRoot: this.ctx.config.root,
          ...reporterOptions,
        })
        .execute(context);
    }

    if (this.options.thresholds) {
      await this.reportThresholds(coverageMap, allTestsRun);
    }
  }

  async parseConfigModule() {
    throw new Error("Coverage threshold auto-update is not supported by the repository-local provider");
  }
}

const providerModule = {
  startCoverage() {
    const coverageMap = globalThis[coverageStoreKey];
    if (!coverageMap) return;

    for (const fileCoverage of Object.values(coverageMap)) {
      for (const key of Object.keys(fileCoverage.b)) {
        fileCoverage.b[key] = fileCoverage.b[key].map(() => 0);
      }
      for (const metric of ["f", "s"]) {
        for (const key of Object.keys(fileCoverage[metric])) {
          fileCoverage[metric][key] = 0;
        }
      }
    }
  },
  takeCoverage() {
    return globalThis[coverageStoreKey];
  },
  getProvider() {
    return new ExistingIstanbulCoverageProvider();
  },
};

export default providerModule;
