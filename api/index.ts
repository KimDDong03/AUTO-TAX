import "express";
import { createApp, createConfiguredStore } from "../server/src/main.js";

const store = await createConfiguredStore();

// Vercel serves static assets from /public directly, so this function only handles /api routes.
const app = await createApp(store, "");

export default app;
