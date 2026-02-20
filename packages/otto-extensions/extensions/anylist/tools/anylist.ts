import { homedir } from "node:os";
import path from "node:path";

import AnyListModule from "anylist";
import { tool } from "@opencode-ai/plugin";

const AnyList =
  (AnyListModule as unknown as { default?: unknown }).default ?? AnyListModule;
const DEFAULT_CREDENTIALS_PATH = path.join(
  homedir(),
  ".otto",
  "secrets",
  "anylist_credentials",
);

const resolveCredentials = (): { email: string; password: string } => {
  const email = process.env.ANYLIST_EMAIL?.trim();
  const password = process.env.ANYLIST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "AnyList credentials missing. Set ANYLIST_EMAIL and ANYLIST_PASSWORD.",
    );
  }

  return { email, password };
};

const withClient = async <T>(run: (client: any) => Promise<T>): Promise<T> => {
  const { email, password } = resolveCredentials();
  const client = new (AnyList as any)({
    email,
    password,
    credentialsFile: DEFAULT_CREDENTIALS_PATH,
  });

  await client.login(false);

  try {
    return await run(client);
  } finally {
    client.teardown();
  }
};

const resolveList = (client: any, listId?: string, listName?: string): any => {
  const id = listId?.trim();
  const name = listName?.trim();
  if (id) {
    const list = client.getListById(id);
    if (!list) {
      throw new Error(`AnyList list not found by id: ${id}`);
    }
    return list;
  }

  if (name) {
    const list = client.getListByName(name);
    if (!list) {
      throw new Error(`AnyList list not found by name: ${name}`);
    }
    return list;
  }

  throw new Error("AnyList listId or listName is required.");
};

const resolveItem = (list: any, itemId?: string, itemName?: string): any => {
  const id = itemId?.trim();
  const name = itemName?.trim();
  if (id) {
    const item = list.getItemById(id);
    if (!item) {
      throw new Error(`AnyList item not found by id: ${id}`);
    }
    return item;
  }

  if (name) {
    const item = list.getItemByName(name);
    if (!item) {
      throw new Error(`AnyList item not found by name: ${name}`);
    }
    return item;
  }

  throw new Error("AnyList itemId or itemName is required.");
};

const resolveRecipe = (
  recipes: any[],
  recipeId?: string,
  recipeName?: string,
): any => {
  const id = recipeId?.trim();
  const name = recipeName?.trim();
  if (id) {
    const recipe = recipes.find((candidate) => candidate.identifier === id);
    if (!recipe) {
      throw new Error(`AnyList recipe not found by id: ${id}`);
    }
    return recipe;
  }

  if (name) {
    const recipe = recipes.find((candidate) => candidate.name === name);
    if (!recipe) {
      throw new Error(`AnyList recipe not found by name: ${name}`);
    }
    return recipe;
  }

  throw new Error("AnyList recipeId or recipeName is required.");
};

export default tool({
  description:
    "Manage AnyList shopping lists and recipes: list lists/items, add/update/remove items, and create/update/delete recipes.",
  args: {
    action: tool.schema.enum([
      "list_lists",
      "list_items",
      "add_item",
      "update_item",
      "remove_item",
      "list_recipes",
      "create_recipe",
      "update_recipe",
      "delete_recipe",
    ]),
    listId: tool.schema.string().optional().describe("Target list identifier"),
    listName: tool.schema
      .string()
      .optional()
      .describe("Target list name (alternative to listId)"),
    itemId: tool.schema.string().optional().describe("Target item identifier"),
    itemName: tool.schema
      .string()
      .optional()
      .describe("Target item name (alternative to itemId)"),
    name: tool.schema
      .string()
      .optional()
      .describe("Item or recipe name, depending on action"),
    quantity: tool.schema.string().optional().describe("Item quantity"),
    details: tool.schema.string().optional().describe("Item details/notes"),
    checked: tool.schema.boolean().optional().describe("Item checked state"),
    query: tool.schema
      .string()
      .optional()
      .describe("Recipe search query for list_recipes"),
    limit: tool.schema
      .number()
      .int()
      .min(1)
      .max(500)
      .optional()
      .describe("Result limit"),
    note: tool.schema.string().optional().describe("Recipe note"),
    sourceName: tool.schema.string().optional().describe("Recipe source title"),
    sourceUrl: tool.schema.string().optional().describe("Recipe source URL"),
    servings: tool.schema.string().optional().describe("Recipe servings"),
    preparationSteps: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Recipe steps"),
    ingredients: tool.schema
      .array(
        tool.schema.object({
          rawIngredient: tool.schema.string().optional(),
          name: tool.schema.string().optional(),
          quantity: tool.schema.string().optional(),
          note: tool.schema.string().optional(),
        }),
      )
      .optional()
      .describe("Recipe ingredients"),
    recipeId: tool.schema
      .string()
      .optional()
      .describe("Target recipe identifier"),
    recipeName: tool.schema
      .string()
      .optional()
      .describe("Target recipe name (alternative to recipeId)"),
  },
  async execute(args): Promise<string> {
    const result = await withClient(async (client) => {
      switch (args.action) {
        case "list_lists": {
          const lists = await client.getLists();
          return {
            lists: lists.map((list: any) => ({
              identifier: list.identifier,
              name: list.name,
              itemCount: Array.isArray(list.items) ? list.items.length : 0,
            })),
          };
        }
        case "list_items": {
          await client.getLists();
          const list = resolveList(client, args.listId, args.listName);
          return {
            list: {
              identifier: list.identifier,
              name: list.name,
            },
            items: (list.items ?? []).map((item: any) => ({
              identifier: item.identifier,
              name: item.name,
              quantity: item.quantity ?? null,
              details: item.details ?? null,
              checked: item.checked === true,
            })),
          };
        }
        case "add_item": {
          if (!args.name) {
            throw new Error("AnyList add_item requires name");
          }
          await client.getLists();
          const list = resolveList(client, args.listId, args.listName);
          const item = client.createItem({
            name: args.name,
            quantity: args.quantity,
            details: args.details,
          });
          const saved = await list.addItem(item);
          if (args.checked === true) {
            saved.checked = true;
            await saved.save();
          }
          return {
            list: {
              identifier: list.identifier,
              name: list.name,
            },
            item: {
              identifier: saved.identifier,
              name: saved.name,
              quantity: saved.quantity ?? null,
              details: saved.details ?? null,
              checked: saved.checked === true,
            },
          };
        }
        case "update_item": {
          await client.getLists();
          const list = resolveList(client, args.listId, args.listName);
          const item = resolveItem(list, args.itemId, args.itemName);
          if (args.name !== undefined) {
            item.name = args.name;
          }
          if (args.quantity !== undefined) {
            item.quantity = args.quantity;
          }
          if (args.details !== undefined) {
            item.details = args.details;
          }
          if (args.checked !== undefined) {
            item.checked = args.checked;
          }
          await item.save();
          return {
            list: {
              identifier: list.identifier,
              name: list.name,
            },
            item: {
              identifier: item.identifier,
              name: item.name,
              quantity: item.quantity ?? null,
              details: item.details ?? null,
              checked: item.checked === true,
            },
          };
        }
        case "remove_item": {
          await client.getLists();
          const list = resolveList(client, args.listId, args.listName);
          const item = resolveItem(list, args.itemId, args.itemName);
          const removed = {
            identifier: item.identifier,
            name: item.name,
            quantity: item.quantity ?? null,
            details: item.details ?? null,
            checked: item.checked === true,
          };
          await list.removeItem(item);
          return {
            list: {
              identifier: list.identifier,
              name: list.name,
            },
            removedItem: removed,
          };
        }
        case "list_recipes": {
          const recipes = await client.getRecipes();
          const query = args.query?.trim().toLowerCase();
          const limit = typeof args.limit === "number" ? args.limit : 50;
          const filtered = query
            ? recipes.filter((recipe: any) =>
                recipe.name.toLowerCase().includes(query),
              )
            : recipes;
          return {
            recipes: filtered.slice(0, limit).map((recipe: any) => ({
              identifier: recipe.identifier,
              name: recipe.name,
              note: recipe.note ?? null,
              sourceName: recipe.sourceName ?? null,
              sourceUrl: recipe.sourceUrl ?? null,
              servings: recipe.servings ?? null,
              ingredientCount: Array.isArray(recipe.ingredients)
                ? recipe.ingredients.length
                : 0,
            })),
          };
        }
        case "create_recipe": {
          if (!args.name) {
            throw new Error("AnyList create_recipe requires name");
          }
          const recipe = await client.createRecipe({
            name: args.name,
            note: args.note,
            sourceName: args.sourceName,
            sourceUrl: args.sourceUrl,
            servings: args.servings,
            preparationSteps: args.preparationSteps,
            ingredients: args.ingredients,
            creationTimestamp: Date.now() / 1000,
            timestamp: Date.now() / 1000,
          });
          await recipe.save();
          return {
            recipe: {
              identifier: recipe.identifier,
              name: recipe.name,
              note: recipe.note ?? null,
              sourceName: recipe.sourceName ?? null,
              sourceUrl: recipe.sourceUrl ?? null,
              servings: recipe.servings ?? null,
              ingredientCount: Array.isArray(recipe.ingredients)
                ? recipe.ingredients.length
                : 0,
            },
          };
        }
        case "update_recipe": {
          const recipes = await client.getRecipes();
          const recipe = resolveRecipe(recipes, args.recipeId, args.recipeName);
          if (args.name !== undefined) {
            recipe.name = args.name;
          }
          if (args.note !== undefined) {
            recipe.note = args.note;
          }
          if (args.sourceName !== undefined) {
            recipe.sourceName = args.sourceName;
          }
          if (args.sourceUrl !== undefined) {
            recipe.sourceUrl = args.sourceUrl;
          }
          if (args.servings !== undefined) {
            recipe.servings = args.servings;
          }
          if (args.preparationSteps !== undefined) {
            recipe.preparationSteps = args.preparationSteps;
          }
          if (args.ingredients !== undefined) {
            recipe.ingredients = args.ingredients;
          }
          await recipe.save();
          return {
            recipe: {
              identifier: recipe.identifier,
              name: recipe.name,
              note: recipe.note ?? null,
              sourceName: recipe.sourceName ?? null,
              sourceUrl: recipe.sourceUrl ?? null,
              servings: recipe.servings ?? null,
              ingredientCount: Array.isArray(recipe.ingredients)
                ? recipe.ingredients.length
                : 0,
            },
          };
        }
        case "delete_recipe": {
          const recipes = await client.getRecipes();
          const recipe = resolveRecipe(recipes, args.recipeId, args.recipeName);
          const removed = {
            identifier: recipe.identifier,
            name: recipe.name,
            note: recipe.note ?? null,
            sourceName: recipe.sourceName ?? null,
            sourceUrl: recipe.sourceUrl ?? null,
            servings: recipe.servings ?? null,
            ingredientCount: Array.isArray(recipe.ingredients)
              ? recipe.ingredients.length
              : 0,
          };
          await recipe.delete();
          return { removedRecipe: removed };
        }
        default:
          throw new Error(`Unsupported AnyList action: ${String(args.action)}`);
      }
    });

    return JSON.stringify(result);
  },
});
