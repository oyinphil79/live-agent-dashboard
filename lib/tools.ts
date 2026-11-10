import type { FunctionTool } from "openai/resources/responses/responses";
import type { Incidents, ToolName } from "./types";

const ORDERS: Record<string, { status: string; courier: string; expected: string; deliveredDaysAgo?: number }> = {
  SN10234: { status: "shipped", courier: "Delhivery", expected: "in 2 days" },
  SN10388: { status: "delivered", courier: "Blue Dart", expected: "delivered", deliveredDaysAgo: 4 },
  SN10412: { status: "out for delivery", courier: "Ekart", expected: "today" },
  SN10501: { status: "delivered", courier: "Delhivery", expected: "delivered", deliveredDaysAgo: 14 },
};

const METRO_PREFIXES = ["11", "40", "56", "60", "70", "50"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SLOW_MS = 3000;
/** Normal latency for a mock upstream call, or 3 s each while "slow tool APIs" is on. */
const upstream = (incidents: Incidents, base: number) => sleep(incidents.slowTools ? SLOW_MS + Math.random() * 300 : base + Math.random() * 120);

const str = (name: string, description: string) => ({ [name]: { type: "string", description } });

function fn(name: ToolName, description: string, param: string, paramDesc: string): FunctionTool {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: { type: "object", properties: str(param, paramDesc), required: [param], additionalProperties: false },
  };
}

export const TOOL_DEFS: FunctionTool[] = [
  fn("track_order", "Look up the shipping status of an order.", "order_id", "Order ID like SN10234"),
  fn("check_return", "Check whether an order can still be returned (10-day window).", "order_id", "Order ID like SN10234"),
  fn("delivery_estimate", "Get the delivery time in days for an Indian pincode.", "pincode", "Six-digit pincode"),
];

function findOrder(id: unknown) {
  const key = String(id ?? "").toUpperCase().trim();
  const order = ORDERS[key];
  if (!order) throw new Error(`404 order ${key || "(empty)"} not found`);
  return order;
}

/** Runs one mock tool. Throws on failure, like a real upstream service would. */
export async function runTool(name: string, args: Record<string, unknown>, incidents: Incidents): Promise<unknown> {
  switch (name) {
    case "track_order": {
      await upstream(incidents, 120);
      if (incidents.orderDown) throw new Error("503 upstream timeout from order-service");
      const { status, courier, expected } = findOrder(args.order_id);
      return { status, courier, expected };
    }
    case "check_return": {
      await upstream(incidents, 80);
      const o = findOrder(args.order_id);
      if (o.deliveredDaysAgo === undefined) return { eligible: false, reason: "not delivered yet" };
      const eligible = o.deliveredDaysAgo <= 10;
      return { eligible, deliveredDaysAgo: o.deliveredDaysAgo, reason: eligible ? "inside 10-day window" : "outside 10-day window" };
    }
    case "delivery_estimate": {
      await upstream(incidents, 100);
      const pin = String(args.pincode ?? "").trim();
      if (!/^\d{6}$/.test(pin)) throw new Error(`400 invalid pincode "${pin}"`);
      const metro = METRO_PREFIXES.some((p) => pin.startsWith(p));
      return { pincode: pin, days: metro ? "2-4" : "5-7" };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}
