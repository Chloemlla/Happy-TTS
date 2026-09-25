import express from "express";
import request from "supertest";
import cloudflareChallengeRoutes from "../routes/cloudflareChallengeRoutes";

function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/cdn-cgi", cloudflareChallengeRoutes);
  app.use((_req, res) => res.status(404).json({ error: "Not Found" }));
  return app;
}

describe("cloudflareChallengeRoutes", () => {
  it("acknowledges Turnstile clearance redemption posts without hitting the 404 handler", async () => {
    await request(createApp())
      .post("/cdn-cgi/challenge-platform/h/g/rc/a08081c06ed6fdbf")
      .send({ secondaryToken: "secondary-token", sitekey: "0x4AAAAAAAw2OBEX19jKyn5c" })
      .expect(200)
      .expect("Content-Type", /text\/plain/)
      .expect("Cache-Control", /no-store/)
      .expect("OK");
  });

  it("responds to preflight for the same reserved Cloudflare path", async () => {
    await request(createApp())
      .options("/cdn-cgi/challenge-platform/h/g/rc/a08081c06ed6fdbf")
      .expect(204)
      .expect("Cache-Control", /no-store/);
  });

  it("does not acknowledge malformed challenge ids", async () => {
    await request(createApp())
      .post("/cdn-cgi/challenge-platform/h/g/rc/bad")
      .send({ secondaryToken: "secondary-token", sitekey: "0x4AAAAAAAw2OBEX19jKyn5c" })
      .expect(404);
  });

  it("stubs the challenge platform API variant seen in production logs", async () => {
    await request(createApp())
      .post("/cdn-cgi/challenge-platform/h/b/c/a4087a62eff8685a")
      .send({ sitekey: "0x4AAAAAAAw2OBEX19jKyn5c" })
      .expect(200)
      .expect("Content-Type", /text\/plain/)
      .expect("Cache-Control", /no-store/)
      .expect("OK");

    await request(createApp())
      .options("/cdn-cgi/challenge-platform/h/b/c/a4087a62eff8685a")
      .expect(204)
      .expect("Cache-Control", /no-store/);
  });

  it("rejects malformed ids on every stubbed challenge path", async () => {
    await request(createApp()).post("/cdn-cgi/challenge-platform/h/b/c/short").send({}).expect(404);
    await request(createApp()).post("/cdn-cgi/challenge-platform/h/b/c/abcdefg!").send({}).expect(404);
  });
});
