import { createRedirectHandler } from "./magnet/_handlers.js";
import { mongoStore } from "./magnet/_store.js";

export default createRedirectHandler(mongoStore);
