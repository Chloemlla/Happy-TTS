const mockGetMissingConfigurationIssues = jest.fn();
const mockNoticeFindOneAndUpdate = jest.fn();
const mockNoticeUpdateOne = jest.fn();
const mockNoticeDeleteOne = jest.fn();
const mockBroadcastCreate = jest.fn();
const mockGetConnectionStats = jest.fn();
const mockNotifyAdmins = jest.fn();

jest.mock("../services/configurationNoticeIssues", () => ({
  getMissingConfigurationIssues: (...args: unknown[]) => mockGetMissingConfigurationIssues(...args),
}));

jest.mock("../models/configurationNoticeStateModel", () => ({
  getConfigurationNoticeStateModel: () => ({
    findOneAndUpdate: (...args: unknown[]) => mockNoticeFindOneAndUpdate(...args),
    updateOne: (...args: unknown[]) => mockNoticeUpdateOne(...args),
    deleteOne: (...args: unknown[]) => mockNoticeDeleteOne(...args),
  }),
}));

jest.mock("../models/broadcastLogModel", () => ({
  getBroadcastLogModel: () => ({ create: (...args: unknown[]) => mockBroadcastCreate(...args) }),
}));

jest.mock("../services/wsService", () => ({
  wsService: {
    getConnectionStats: (...args: unknown[]) => mockGetConnectionStats(...args),
    notifyAdmins: (...args: unknown[]) => mockNotifyAdmins(...args),
  },
}));

const { notifyAdminsForFrontendVisit } = require("../services/configurationNoticeService");

function execResult(value: unknown = {}) {
  return { exec: jest.fn().mockResolvedValue(value) };
}

describe("configuration notice delivery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNoticeFindOneAndUpdate.mockImplementation(() => execResult({}));
    mockNoticeUpdateOne.mockImplementation(() => execResult({}));
    mockNoticeDeleteOne.mockImplementation(() => execResult({}));
    mockBroadcastCreate.mockResolvedValue({});
    mockGetConnectionStats.mockReturnValue({ admins: 0 });
    mockNotifyAdmins.mockReturnValue(0);
  });

  it("changes the deduplication fingerprint when missing names change within one issue", async () => {
    mockGetMissingConfigurationIssues
      .mockResolvedValueOnce([
        { id: "captcha", label: "Captcha", settingNames: ["SITE", "SECRET"], impact: "disabled" },
      ])
      .mockResolvedValueOnce([
        { id: "captcha", label: "Captcha", settingNames: ["SECRET"], impact: "disabled" },
      ]);

    await notifyAdminsForFrontendVisit();
    await notifyAdminsForFrontendVisit();

    const firstFilter = mockNoticeFindOneAndUpdate.mock.calls[0][0];
    const secondFilter = mockNoticeFindOneAndUpdate.mock.calls[1][0];
    expect(firstFilter.fingerprint.$ne).not.toBe(secondFilter.fingerprint.$ne);
  });

  it("does not mark a notice delivered when all expected admin sockets disappeared", async () => {
    mockGetMissingConfigurationIssues.mockResolvedValue([
      { id: "tts", label: "TTS", settingNames: ["OPENAI_API_KEY"], impact: "disabled" },
    ]);
    mockGetConnectionStats.mockReturnValue({ admins: 1 });
    mockNotifyAdmins.mockReturnValue(0);

    await notifyAdminsForFrontendVisit();

    expect(mockNotifyAdmins).toHaveBeenCalledTimes(1);
    expect(mockNoticeUpdateOne).not.toHaveBeenCalled();
  });

  it("marks a notice delivered only after a websocket send succeeds", async () => {
    mockGetMissingConfigurationIssues.mockResolvedValue([
      { id: "tts", label: "TTS", settingNames: ["OPENAI_API_KEY"], impact: "disabled" },
    ]);
    mockGetConnectionStats.mockReturnValue({ admins: 1 });
    mockNotifyAdmins.mockReturnValue(1);

    await notifyAdminsForFrontendVisit();

    expect(mockNoticeUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: expect.any(String) }),
      expect.objectContaining({ $set: expect.objectContaining({ deliveredAt: expect.any(Date) }) }),
    );
  });
});
