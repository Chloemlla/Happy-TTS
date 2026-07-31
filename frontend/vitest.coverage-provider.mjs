import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { BaseCoverageProvider } from "vitest/node";

const localRequire = createRequire(import.meta.url);
const rootRequire = createRequire(new URL("../package.json", import.meta.url));
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
  name = "istanbul";
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
