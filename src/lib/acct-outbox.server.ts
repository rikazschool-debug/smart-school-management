import {
  dispatchMessages,
  type DeliveryScope,
} from "./message-delivery.server";
/** Exact authorized provisioning rows or one explicit organization worker. Never global. */
export const drainAcctOutbox = (scope: DeliveryScope) =>
  dispatchMessages("acct", scope);
