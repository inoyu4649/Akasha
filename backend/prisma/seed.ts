import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const models = [
  { modelName: "llama3.2:1b",              creditCost: 1 },
  { modelName: "llama3.2:3b",              creditCost: 1 },
  { modelName: "phi4-mini",                creditCost: 1 },
  { modelName: "gemma3:4b",                creditCost: 1 },
  { modelName: "qwen3:4b",                 creditCost: 1 },
  { modelName: "qwen2.5-coder:3b",         creditCost: 1 },
  { modelName: "llama3.2:8b",              creditCost: 3 },
  { modelName: "qwen3:7b",                 creditCost: 3 },
  { modelName: "qwen2.5-coder:7b",         creditCost: 3 },
  { modelName: "deepseek-r1-distill-qwen:7b", creditCost: 5 },
];

async function main() {
  console.log("Seeding model_config...");

  for (const model of models) {
    await prisma.modelConfig.upsert({
      where: { modelName: model.modelName },
      update: { creditCost: model.creditCost },
      create: { modelName: model.modelName, creditCost: model.creditCost, enabled: true },
    });
  }

  console.log(`Seeded ${models.length} models.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
