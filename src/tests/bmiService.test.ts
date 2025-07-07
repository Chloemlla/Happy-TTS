import { NetworkService } from '../services/networkService';

describe('NetworkService - BMI', () => {
  it('正常计算BMI', () => {
    const result = NetworkService.bmiCalculate('180', '80');
    expect(result.success).toBe(true);
    expect(result.data.code).toBe(200);
    expect(result.data.data.bmi).toBeCloseTo(24.69, 2);
    expect(result.data.data.msg).toContain('理想体重');
  });

  it('正常计算BMI（正常体重）', () => {
    const result = NetworkService.bmiCalculate('170', '65');
    expect(result.success).toBe(true);
    expect(result.data.data.bmi).toBeCloseTo(22.49, 2);
    expect(result.data.data.msg).toBe('您的身体指数正常，继续保持');
  });

  it('BMI偏低', () => {
    const result = NetworkService.bmiCalculate('170', '48');
    expect(result.success).toBe(true);
    expect(result.data.data.bmi).toBeLessThan(18.5);
    expect(result.data.data.msg).toContain('偏低');
  });

  it('BMI偏高', () => {
    const result = NetworkService.bmiCalculate('170', '70');
    expect(result.success).toBe(true);
    expect(result.data.data.bmi).toBeGreaterThanOrEqual(24);
    expect(result.data.data.bmi).toBeLessThan(28);
    expect(result.data.data.msg).toContain('偏高');
  });

  it('BMI过高', () => {
    const result = NetworkService.bmiCalculate('170', '90');
    expect(result.success).toBe(true);
    expect(result.data.data.bmi).toBeGreaterThanOrEqual(28);
    expect(result.data.data.msg).toContain('过高');
  });

  it('缺少参数', () => {
    const result = NetworkService.bmiCalculate('', '70');
    expect(result.success).toBe(false);
    expect(result.error).toBe('身高和体重参数不能为空');
  });

  it('参数为0', () => {
    const result = NetworkService.bmiCalculate('0', '70');
    expect(result.success).toBe(false);
    expect(result.error).toBe('身高和体重必须为正数');
  });

  it('参数为负数', () => {
    const result = NetworkService.bmiCalculate('-170', '70');
    expect(result.success).toBe(false);
    expect(result.error).toBe('身高和体重必须为正数');
  });

  it('参数为非数字', () => {
    const result = NetworkService.bmiCalculate('abc', '70');
    expect(result.success).toBe(false);
    expect(result.error).toBe('身高和体重必须为正数');
  });
}); 