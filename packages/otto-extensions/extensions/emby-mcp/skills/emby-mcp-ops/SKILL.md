---
name: emby-mcp-ops
description: Use Emby MCP tools to browse libraries, search media, manage playlists, and control players.
---

## When to use

- Use this skill when the user asks to browse or control media in an Emby server.
- Start with discovery tools before action tools so context (libraries, players, ids) is correct.

## Workflow

1. Run `retrieve_library_list`, then select one using `select_library`.
2. Use `search_for_item` with specific filters (title, artist, genre, years, lyrics/description).
3. If search response says `more_chunks_available`, call `retrieve_next_search_chunk` until false.
4. Use returned ids for playlist operations (`create_playlist`, `add_items_to_playlist`, `retrieve_playlist_items`).
5. For playback, list players with `retrieve_player_list` and then control a chosen session with `control_media_player`.

## Best practices

- Keep search queries narrow to reduce chunking and improve relevance.
- Confirm the target player/session before sending control commands.
- Prefer non-destructive operations first (list/retrieve before modify/delete).

## Safety

- Confirm before destructive actions (removing playlist items, stopping sharing, overwriting playlist order).
- Do not expose credentials from `.env` in output.
