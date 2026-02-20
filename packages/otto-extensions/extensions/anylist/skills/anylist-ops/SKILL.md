---
name: anylist-ops
description: Manage AnyList shopping lists and recipes through Otto tools.
---

## When to use

- Use this skill when the user asks to manage shopping lists, pantry items, or recipes in AnyList.

## Workflow

1. Start with `anylist` action `list_lists` to discover available lists.
2. For shopping-list operations, resolve list first and then run `list_items`, `add_item`, `update_item`, or `remove_item`.
3. For recipe operations, use `list_recipes` before `update_recipe` or `delete_recipe` unless a direct `recipeId` is provided.

## Best practices

- Prefer exact `listId` and `itemId` when available to avoid ambiguity.
- For `update_item` and `update_recipe`, only pass fields that should change.
- Confirm destructive operations (remove item, delete recipe) in user-facing responses.
