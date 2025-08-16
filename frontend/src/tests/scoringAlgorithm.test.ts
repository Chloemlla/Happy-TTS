/**
 * 评分算法单元测试
 * 测试各种边界情况和评分逻辑
 */

interface BehaviorStats {
    mouseMoves: number;
    keyPresses: number;
    totalDistance: number;
    uniquePathPoints: number;
    avgSpeed: number;
    maxSpeed: number;
    minSpeed: number;
    speedVariance: number;
    focusTimeMs: number;
    visibilityChanges: number;
    trapTriggered: boolean;
    keyTimings: number[];
    avgKeyInterval: number;
    keyPressVariance: number;
    mouseAcceleration: number;
    directionChanges: number;
    pauseCount: number;
    clickCount: number;
    screenResolution: string;
    devicePixelRatio: number;
    touchSupport: boolean;
    sessionDuration: number;
    idleTime: number;
}

// 模拟评分算法
function calculateBehaviorScore(s: BehaviorStats): number {
    // 基础行为特征评分
    const mouseActivityScore = Math.min(1, Math.log10(1 + s.mouseMoves) / 2.5);
    const keyboardActivityScore = Math.min(1, Math.log10(1 + s.keyPresses) / 2.2);
    const movementDistanceScore = Math.min(1, Math.log10(1 + s.totalDistance) / 3.2);
    const pathComplexityScore = Math.min(1, s.uniquePathPoints / 200);
    const focusEngagementScore = Math.min(1, s.focusTimeMs / 4000);

    // 高级行为模式评分
    const speedConsistencyScore = s.speedVariance > 0 ?
        Math.min(1, 1 / (1 + s.speedVariance * 0.1)) : 0.5;

    const accelerationNaturalnessScore = s.mouseAcceleration > 0 ?
        Math.min(1, 1 / (1 + Math.abs(s.mouseAcceleration - 0.5) * 2)) : 0.5;

    const directionVariabilityScore = s.directionChanges > 0 ?
        Math.min(1, Math.log10(1 + s.directionChanges) / 2.0) : 0;

    const pausePatternScore = s.pauseCount > 0 ?
        Math.min(1, Math.log10(1 + s.pauseCount) / 1.8) : 0;

    const clickPatternScore = s.clickCount > 0 ?
        Math.min(1, Math.log10(1 + s.clickCount) / 1.5) : 0;

    // 键盘行为模式评分
    const keyTimingNaturalnessScore = s.keyPressVariance > 0 ?
        Math.min(1, 1 / (1 + Math.abs(s.keyPressVariance - 150) * 0.01)) : 0.5;

    const keyRhythmScore = s.avgKeyInterval > 0 && s.avgKeyInterval < 2000 ?
        Math.min(1, 1 / (1 + Math.abs(s.avgKeyInterval - 200) * 0.005)) : 0.3;

    // 时间模式评分
    const sessionEngagementScore = Math.min(1, s.sessionDuration / 10000);
    const activityConsistencyScore = s.idleTime < 5000 ? 1 : Math.max(0, 1 - (s.idleTime - 5000) / 15000);

    // 设备特征评分
    const deviceNaturalnessScore = s.touchSupport ? 0.8 : 0.9;

    // 权重配置
    const weights = {
        mouseActivity: 0.12,
        keyboardActivity: 0.10,
        movementDistance: 0.12,
        pathComplexity: 0.12,
        focusEngagement: 0.15,
        speedConsistency: 0.08,
        accelerationNaturalness: 0.06,
        directionVariability: 0.05,
        pausePattern: 0.04,
        clickPattern: 0.03,
        keyTimingNaturalness: 0.05,
        keyRhythm: 0.03,
        sessionEngagement: 0.03,
        activityConsistency: 0.02
    };

    // 计算加权基础分
    const baseScore =
        mouseActivityScore * weights.mouseActivity +
        keyboardActivityScore * weights.keyboardActivity +
        movementDistanceScore * weights.movementDistance +
        pathComplexityScore * weights.pathComplexity +
        focusEngagementScore * weights.focusEngagement +
        speedConsistencyScore * weights.speedConsistency +
        accelerationNaturalnessScore * weights.accelerationNaturalness +
        directionVariabilityScore * weights.directionVariability +
        pausePatternScore * weights.pausePattern +
        clickPatternScore * weights.clickPattern +
        keyTimingNaturalnessScore * weights.keyTimingNaturalness +
        keyRhythmScore * weights.keyRhythm +
        sessionEngagementScore * weights.sessionEngagement +
        activityConsistencyScore * weights.activityConsistency;

    // 应用惩罚因子
    const visibilityPenalty = Math.max(0.3, 1 - s.visibilityChanges * 0.1);
    const trapPenalty = s.trapTriggered ? 0.1 : 1;

    // 应用设备特征调整
    const deviceAdjustedScore = baseScore * deviceNaturalnessScore;

    // 最终评分
    const finalScore = Math.max(0, Math.min(1, deviceAdjustedScore * visibilityPenalty * trapPenalty));

    return finalScore;
}

describe('Scoring Algorithm', () => {
    const createBaseBehaviorStats = (): BehaviorStats => ({
        mouseMoves: 0,
        keyPresses: 0,
        totalDistance: 0,
        uniquePathPoints: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        minSpeed: Number.MAX_SAFE_INTEGER,
        speedVariance: 0,
        focusTimeMs: 0,
        visibilityChanges: 0,
        trapTriggered: false,
        keyTimings: [],
        avgKeyInterval: 0,
        keyPressVariance: 0,
        mouseAcceleration: 0,
        directionChanges: 0,
        pauseCount: 0,
        clickCount: 0,
        screenResolution: '1920x1080',
        devicePixelRatio: 1,
        touchSupport: false,
        sessionDuration: 0,
        idleTime: 0,
    });

    describe('Basic behavior scoring', () => {
        it('should return low score for minimal activity', () => {
            const stats = createBaseBehaviorStats();
            const score = calculateBehaviorScore(stats);
            expect(score).toBeLessThan(0.3);
        });

        it('should return higher score for normal human activity', () => {
            const stats = createBaseBehaviorStats();
            stats.mouseMoves = 150;
            stats.keyPresses = 20;
            stats.totalDistance = 2000;
            stats.uniquePathPoints = 80;
            stats.focusTimeMs = 5000;
            stats.speedVariance = 0.5;
            stats.mouseAcceleration = 0.4;
            stats.directionChanges = 15;
            stats.pauseCount = 8;
            stats.clickCount = 5;
            stats.avgKeyInterval = 200;
            stats.keyPressVariance = 150;
            stats.sessionDuration = 15000;
            stats.idleTime = 1000;

            const score = calculateBehaviorScore(stats);
            expect(score).toBeGreaterThan(0.6);
            expect(score).toBeLessThan(1.0);
        });

        it('should heavily penalize trap triggering', () => {
            const stats = createBaseBehaviorStats();
            stats.mouseMoves = 200;
            stats.keyPresses = 30;
            stats.totalDistance = 3000;
            stats.uniquePathPoints = 100;
            stats.focusTimeMs = 8000;
            stats.trapTriggered = true; // This should cause heavy penalty

            const score = calculateBehaviorScore(stats);
            expect(score).toBeLessThan(0.2); // Should be very low due to trap
        });

        it('should penalize excessive visibility changes', () => {
            const stats = createBaseBehaviorStats();
            stats.mouseMoves = 150;
            stats.keyPresses = 20;
            stats.totalDistance = 2000;
            stats.uniquePathPoints = 80;
            stats.focusTimeMs = 5000;
            stats.visibilityChanges = 20; // Excessive visibility changes

            const score = calculateBehaviorScore(stats);
            expect(score).toBeLessThan(0.4); // Should be penalized
        });
    });

    describe('Advanced behavior patterns', () => {
        it('should reward natural speed variance', () => {
            const stats1 = createBaseBehaviorStats();
            stats1.mouseMoves = 100;
            stats1.speedVariance = 0.5; // Natural variance

            const stats2 = createBaseBehaviorStats();
            stats2.mouseMoves = 100;
            stats2.speedVariance = 0; // No variance (robotic)

            const score1 = calculateBehaviorScore(stats1);
            const score2 = calculateBehaviorScore(stats2);

            expect(score1).toBeGreaterThan(score2);
        });

        it('should reward natural acceleration patterns', () => {
            const stats1 = createBaseBehaviorStats();
            stats1.mouseMoves = 100;
            stats1.mouseAcceleration = 0.5; // Natural acceleration

            const stats2 = createBaseBehaviorStats();
            stats2.mouseMoves = 100;
            stats2.mouseAcceleration = 5.0; // Unnatural acceleration

            const score1 = calculateBehaviorScore(stats1);
            const score2 = calculateBehaviorScore(stats2);

            expect(score1).toBeGreaterThan(score2);
        });

        it('should reward natural key timing patterns', () => {
            const stats1 = createBaseBehaviorStats();
            stats1.keyPresses = 20;
            stats1.avgKeyInterval = 200; // Natural typing rhythm
            stats1.keyPressVariance = 150; // Natural variance

            const stats2 = createBaseBehaviorStats();
            stats2.keyPresses = 20;
            stats2.avgKeyInterval = 50; // Too fast (robotic)
            stats2.keyPressVariance = 5; // Too consistent

            const score1 = calculateBehaviorScore(stats1);
            const score2 = calculateBehaviorScore(stats2);

            expect(score1).toBeGreaterThan(score2);
        });
    });

    describe('Device-specific adjustments', () => {
        it('should adjust score for touch devices', () => {
            const desktopStats = createBaseBehaviorStats();
            desktopStats.mouseMoves = 100;
            desktopStats.touchSupport = false;

            const touchStats = createBaseBehaviorStats();
            touchStats.mouseMoves = 100;
            touchStats.touchSupport = true;

            const desktopScore = calculateBehaviorScore(desktopStats);
            const touchScore = calculateBehaviorScore(touchStats);

            // Touch devices should have slightly lower base score
            expect(touchScore).toBeLessThan(desktopScore);
        });
    });

    describe('Edge cases', () => {
        it('should handle extreme values gracefully', () => {
            const stats = createBaseBehaviorStats();
            stats.mouseMoves = 10000;
            stats.keyPresses = 1000;
            stats.totalDistance = 100000;
            stats.uniquePathPoints = 5000;
            stats.focusTimeMs = 100000;
            stats.speedVariance = 100;
            stats.mouseAcceleration = 50;

            const score = calculateBehaviorScore(stats);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });

        it('should return valid score for zero activity', () => {
            const stats = createBaseBehaviorStats();
            const score = calculateBehaviorScore(stats);

            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
            expect(typeof score).toBe('number');
            expect(isNaN(score)).toBe(false);
        });
    });
});