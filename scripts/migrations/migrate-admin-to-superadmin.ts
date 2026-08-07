import { connectMongo } from "../../src/services/mongoService";
import { getAllUsersAuth, updateUser } from "../../src/services/userService";

async function main() {
  await connectMongo();

  const users = await getAllUsersAuth();
  let upgraded = 0;
  let skipped = 0;

  for (const user of users) {
    if (user.role !== "admin") {
      skipped += 1;
      continue;
    }

    await updateUser(user.id, { role: "superadmin" });
    upgraded += 1;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        upgraded,
        skipped,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error("[migrate-admin-to-superadmin] failed", error);
  process.exit(1);
});
