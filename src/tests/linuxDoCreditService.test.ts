import crypto from "node:crypto";
import { signEpayParams, verifyEpayNotify } from "../services/linuxDoCreditService";

describe("linuxDoCreditService signing", () => {
  const secret = "test_secret_key";

  it("signs EasyPay params with sorted keys and trailing secret", () => {
    const params = {
      money: "10",
      name: "Test",
      out_trade_no: "M20250101",
      pid: "001",
      type: "epay",
    };
    const sign = signEpayParams(params, secret);
    const expectedPayload = "money=10&name=Test&out_trade_no=M20250101&pid=001&type=epay" + secret;
    const expected = crypto.createHash("md5").update(expectedPayload, "utf8").digest("hex");
    expect(sign).toBe(expected);
  });

  it("excludes sign and sign_type from payload", () => {
    const params = {
      money: "10.00",
      name: "Test",
      out_trade_no: "M1",
      pid: "1",
      type: "epay",
      sign_type: "MD5",
      sign: "deadbeef",
    };
    const sign = signEpayParams(params, secret);
    const expectedPayload = "money=10.00&name=Test&out_trade_no=M1&pid=1&type=epay" + secret;
    const expected = crypto.createHash("md5").update(expectedPayload, "utf8").digest("hex");
    expect(sign).toBe(expected);
  });

  it("verifies notify signature", () => {
    const params: Record<string, string> = {
      money: "10",
      name: "Test",
      out_trade_no: "M20250101",
      pid: "001",
      trade_no: "T1",
      trade_status: "TRADE_SUCCESS",
      type: "epay",
    };
    params.sign = signEpayParams(params, secret);
    expect(verifyEpayNotify(params, secret)).toBe(true);
    expect(verifyEpayNotify({ ...params, sign: "bad" }, secret)).toBe(false);
  });
});