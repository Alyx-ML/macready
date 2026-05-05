import { Database } from "bun:sqlite";

export function handleAgentCommand(db: Database, cmd: any) {
  const intent = cmd.intent;
  const gameName = cmd.gameName;

  const getEntity = (type: string) => cmd.entities.find((e: any) => e.type === type)?.value || "";

  const fuzzyFindGame = (name: string) => {
    if (!name) return null;
    
    // Exact match
    let g = db.query(`SELECT * FROM games WHERE name COLLATE NOCASE = ?`).get(name);
    if (g) return g;
    
    // Contains match
    g = db.query(`SELECT * FROM games WHERE name LIKE ?`).get(`%${name}%`);
    return g || null;
  };
  try {
    switch (intent) {
      case "add_game":
      case "add_test":
      case "update_game": {
        if (!gameName) return { success: false, message: "Which game should I update?" };
        
        const platform = getEntity("platform");
        let game = fuzzyFindGame(gameName);
        
        if (!game) {
          // Create new game with platform
          db.query(`INSERT INTO games (name, platform) VALUES (?, ?)`).run(gameName, platform);
          game = db.query(`SELECT * FROM games WHERE id = last_insert_rowid()`).get();
        } else if (platform) {
          // Update platform if provided for existing game
          db.query(`UPDATE games SET platform = ? WHERE id = ?`).run(platform, (game as any).id);
        }

        const status = getEntity("status") || "working";
        
        db.query(`
          INSERT INTO tests (game_id, status, wine_version, macos_version, hardware, fps, notes) 
          VALUES (?, ?, ?, ?, ?, ?, 'Updated via Bun agent')
        `).run(
          (game as any).id, 
          status, 
          getEntity("wine_version"), 
          getEntity("macos_version"), 
          getEntity("hardware"), 
          getEntity("fps")
        );

        return { success: true, message: `Updated **${(game as any).name}** — marked as **${status}**${platform ? ` on **${platform}**` : ""}.` };
      }

      case "list_games":
        return { success: true, message: "Use the UI filters above to explore your games!" };

      case "delete_game": {
        if (!gameName) return { success: false, message: "Which game should I delete?" };
        const game = fuzzyFindGame(gameName);
        if (!game) return { success: false, message: `Game not found: ${gameName}` };

        return {
          success: false,
          message: `I found **${(game as any).name}**, but I won't delete games from chat. Open the game and delete it from a deliberate management action instead.`,
        };
      }

      default:
        return { success: false, message: `I'm not sure what to do with "${cmd.raw}".` };
    }
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}
