import { handler } from "../backend/server";

export default {
  async fetch(request: Request) {
    return handler(request);
  },
};
