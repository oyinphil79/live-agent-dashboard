export const SYSTEM_PROMPT = `You are the customer support agent for ShopNow, an online store in India.
Be brief and friendly: two or three sentences.
Facts:
- Delivery takes 2-4 days in metro cities and 5-7 days elsewhere.
- Returns are accepted within 10 days of delivery.
- We accept UPI, credit and debit cards, and cash on delivery for orders up to ₹5,000.
Use the tools to look up orders, return eligibility and delivery times instead of guessing.
If a tool fails, apologise and say the team will follow up. Never invent order details.`;

export const CUSTOMER_MESSAGES = [
  "Where is my order SN10234?",
  "Can I still return order SN10388? The shoes don't fit.",
  "How long will delivery take to pincode 560001?",
  "Hi, order SN10412 hasn't arrived yet. Any update?",
  "Do you take cash on delivery for a ₹7,000 order?",
  "Is SN10234 eligible for return?",
  "How many days to deliver to 795001 in Manipur?",
  "Track SN10501 please.",
  "Can I pay with UPI?",
  "Order SN10388 says delivered but I didn't get it. Where is it?",
];

const CATEGORIES = ["Kurta", "Saree", "Sneakers", "Headphones", "Pressure cooker", "Backpack", "Smartwatch", "Bedsheet", "Water bottle", "Phone case", "Jeans", "Mixer grinder"];
const COLORS = ["black", "navy", "maroon", "olive", "white", "mustard", "teal", "grey", "rose", "indigo"];

/** About 120 lines of generated catalog, appended to the prompt by the "huge prompt" incident. */
export function productCatalog(lines = 120): string {
  const rows: string[] = [];
  for (let i = 0; i < lines; i++) {
    const cat = CATEGORIES[i % CATEGORIES.length];
    const color = COLORS[(i * 7) % COLORS.length];
    const price = 299 + ((i * 437) % 9700);
    const stock = (i * 13) % 90;
    rows.push(
      `SKU SN-P${10000 + i} | ${cat} (${color}) | ₹${price} | stock ${stock} | ships in ${1 + (i % 4)} days | COD ${price <= 5000 ? "yes" : "no"} | returnable ${i % 9 === 0 ? "no" : "yes"}`,
    );
  }
  return `\n\nFull product catalog (reference only):\n${rows.join("\n")}`;
}
