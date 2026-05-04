import { connectMongo } from "../../src/services/mongoService";
import {
  getAllUsersAuth,
  updateUser,
  verifyAndMigrateUserPassword,
} from "../../src/services/userService";

async function main() {
  await connectMongo();

  const users = await getAllUsersAuth();
  let migrated = 0;
  let skipped = 0;

  for (const user of users) {
    if (user.passwordHash && user.passwordCiphertext && user.passwordWrappedDek) {
      skipped += 1;
      continue;
    }

    if (!user.password) {
      skipped += 1;
      continue;
    }

    const result = await verifyAndMigrateUserPassword(
      {
        ...user,
        password: user.password,
      },
      user.password,
    );

    if (result.valid) {
      await updateUser(user.id, { password: user.password });
      migrated += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        migrated,
        skipped,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error("[migrate-user-passwords] failed", error);
  process.exit(1);
});
