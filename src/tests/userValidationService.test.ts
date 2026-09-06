import { userValidationService } from "../utils/userValidationService";

describe("userValidationService.validateUserInput", () => {
  it("validates a normal username identifier for login", () => {
    const errors = userValidationService.validateUserInput("synapse", "x", undefined, false);
    expect(errors).toEqual([]);
  });

  it("accepts an email-shaped identifier for login instead of validating it as a username", () => {
    const errors = userValidationService.validateUserInput("chlormlla@gmail.com", "x", undefined, false);
    expect(errors).toEqual([]);
  });

  it("still rejects a malformed non-email login identifier", () => {
    const errors = userValidationService.validateUserInput("bad user!", "x", undefined, false);
    expect(errors).toContainEqual({ field: "username", message: "用户名只能包含字母、数字和下划线" });
  });

  it("still requires a non-empty identifier", () => {
    const errors = userValidationService.validateUserInput("", "x", undefined, false);
    expect(errors).toEqual([{ field: "username", message: "用户名不能为空" }]);
  });

  it("keeps registration username checks strict and does not treat the username field as an email", () => {
    const errors = userValidationService.validateUserInput("bad user!", "x", "x@example.com", true);
    expect(errors).toContainEqual({ field: "username", message: "用户名只能包含字母、数字和下划线" });
  });
});
