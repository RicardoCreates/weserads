import { createCustomerHandler } from "./magnet/_handlers.js";
import { notifyNewRequest } from "./magnet/_notify.js";
import { mongoStore } from "./magnet/_store.js";

export default createCustomerHandler(mongoStore, notifyNewRequest);
