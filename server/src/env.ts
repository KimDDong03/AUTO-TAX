import dotenv from "dotenv";

for (const envFile of [".env.local", ".env"]) {
  dotenv.config({
    path: envFile,
    quiet: true
  });
}
