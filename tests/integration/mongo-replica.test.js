const { MongoClient } = require("mongodb");

const mongoUri = process.env.MONGO_REPLICA_URI;
const describeReplica = mongoUri ? describe : describe.skip;

describeReplica("Mongo replica-set integration contract", () => {
  let client;
  let db;

  beforeAll(async () => {
    client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    db = client.db(`synapse_contract_${Date.now()}`);
  });

  afterAll(async () => {
    if (db) await db.dropDatabase();
    if (client) await client.close();
  });

  test("runs a multi-document transaction with commit and rollback semantics", async () => {
    const users = db.collection("users");
    const usage = db.collection("usage");
    const session = client.startSession();

    try {
      await session.withTransaction(async () => {
        await users.insertOne({ _id: "user-1", status: "active" }, { session });
        await usage.insertOne({ _id: "usage-1", userId: "user-1", count: 1 }, { session });
      });

      expect(await users.countDocuments({ _id: "user-1" })).toBe(1);
      expect(await usage.countDocuments({ userId: "user-1" })).toBe(1);

      await expect(
        session.withTransaction(async () => {
          await usage.updateOne({ _id: "usage-1" }, { $inc: { count: 1 } }, { session });
          await users.insertOne({ _id: "user-1", status: "duplicate" }, { session });
        }),
      ).rejects.toMatchObject({ code: 11000 });

      expect(await usage.findOne({ _id: "usage-1" })).toMatchObject({ count: 1 });
    } finally {
      await session.endSession();
    }
  });

  test("creates and observes a TTL index used by privacy retention contracts", async () => {
    const temporary = db.collection("temporary_identifiers");
    await temporary.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expiresAt_ttl" });

    const indexes = await temporary.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "expiresAt_ttl", key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
      ]),
    );
  });
});
