import { config as loadEnv } from "dotenv";
import AnyList from "anylist";

loadEnv();

const email = process.env.ANYLIST_EMAIL?.trim();
const password = process.env.ANYLIST_PASSWORD?.trim();

if (!email || !password) {
  throw new Error(
    "Missing ANYLIST_EMAIL or ANYLIST_PASSWORD in packages/experiments/.env",
  );
}

const client = new AnyList({ email, password });

const main = async (): Promise<void> => {
  await client.login();
  await client.getLists();

  const lists = client.lists ?? [];
  console.log(`Connected to AnyList. Found ${lists.length} list(s).`);

  for (const list of lists) {
    const name = typeof list.name === "string" ? list.name : "(unnamed)";
    const identifier =
      typeof list.identifier === "string" ? list.identifier : "(no-id)";
    console.log(`- ${name} [${identifier}]`);
  }
};

main()
  .then(() => {
    client.teardown();
  })
  .catch((error: unknown) => {
    client.teardown();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`AnyList test failed: ${message}`);
    process.exitCode = 1;
  });
