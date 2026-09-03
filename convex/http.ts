import { httpRouter } from "convex/server";
import { handleWebhook } from "./telegram";

const http = httpRouter();

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: handleWebhook,
});

export default http;
