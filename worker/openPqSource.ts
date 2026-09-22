import seed from "../data/destination-knowledge-v0.json";

type SeedItem = (typeof seed.items)[number];

export async function loadDestinationKnowledge(): Promise<{
  expiresAt:number;
  sourceState:"bundled_test_snapshot";
  items:SeedItem[];
}> {
  return {
    expiresAt:Number.MAX_SAFE_INTEGER,
    sourceState:"bundled_test_snapshot",
    items:seed.items as SeedItem[],
  };
}
