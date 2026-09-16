const economy = require("./economy.js");

const SHOP_ITEMS = [
  {
    id: "vip_badge",
    name: "🌟 VIP Badge",
    price: 2000,
    desc: "Shows a VIP star next to your name in .profile",
  },
  {
    id: "xp_booster",
    name: "⚡ XP Booster (2x, 24h)",
    price: 1500,
    desc: "Doubles RPG XP gain for 24 hours",
  },
  {
    id: "shield",
    name: "🛡 Rob Shield (24h)",
    price: 1000,
    desc: "Protects you from .rob for 24 hours",
  },
  {
    id: "lucky_charm",
    name: "🍀 Lucky Charm",
    price: 800,
    desc: "Slightly improves your .slot odds (cosmetic + fun)",
  },
  {
    id: "custom_title",
    name: "🏷 Custom Title",
    price: 3000,
    desc: "Set a custom title shown in .profile (use .settitle after buying)",
  },
  {
    id: "trophy",
    name: "🏆 Golden Trophy",
    price: 5000,
    desc: "A flex item for your inventory. Bragging rights only.",
  },
];

let _db = null;

function getDb() {
  if (!_db) {
    throw new Error(
      "[shop.js] initTables(db) must be called once at bot startup " +
        "before using shop functions.",
    );
  }
  return _db;
}

/**
 * Creates the `shop_inventory` and `shop_profile` tables if missing.
 * Safe to call on every boot.
 */
async function initTables(pool) {
  _db = pool;
  await pool.promise().query(`
        CREATE TABLE IF NOT EXISTS shop_inventory (
            user_id  VARCHAR(255) NOT NULL,
            item_id  VARCHAR(100) NOT NULL,
            qty      INT NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, item_id)
        )
    `);
  await pool.promise().query(`
        CREATE TABLE IF NOT EXISTS shop_profile (
            user_id VARCHAR(255) PRIMARY KEY,
            title   VARCHAR(60) DEFAULT NULL
        )
    `);
  console.log(
    "[shop.js] shop_inventory / shop_profile tables ready (created if missing).",
  );
}

function getItem(itemId) {
  return SHOP_ITEMS.find((i) => i.id === (itemId || "").toLowerCase());
}

function listShop() {
  let msg = `🛍️ *Alexa Shop*\n\n`;
  SHOP_ITEMS.forEach((item, i) => {
    msg += `${i + 1}. *${item.name}*\n   💵 ${economy.fmt(item.price)} — ${item.desc}\n   🔑 id: \`${item.id}\`\n\n`;
  });
  msg += `Buy with: *.buy <item_id>*\nCheck your items: *.inventory*`;
  return msg;
}

/** .buy <item_id> — purchase an item, deducting AlexaCash */
async function buyItem(userId, itemId) {
  const item = getItem((itemId || "").trim());
  if (!item) {
    return {
      ok: false,
      message: `❌ Item not found. Use *.shop* to see the list.`,
    };
  }

  const balance = await economy.getBalance(userId);
  if (balance < item.price) {
    return {
      ok: false,
      message: `❌ Not enough ${economy.CURRENCY_NAME}. You need ${economy.fmt(item.price)} but have ${economy.fmt(balance)}.`,
    };
  }

  await economy.addBalance(userId, -item.price);

  const db = getDb();
  await db.promise().query(
    `INSERT INTO shop_inventory (user_id, item_id, qty) VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE qty = qty + 1`,
    [userId, item.id],
  );

  const newBalance = await economy.getBalance(userId);
  return {
    ok: true,
    message: `✅ Purchased *${item.name}* for ${economy.fmt(item.price)}!\n👛 Remaining balance: ${economy.fmt(newBalance)}`,
  };
}

/** .inventory / .inv — show items a user owns */
async function showInventory(userId) {
  const db = getDb();
  const [rows] = await db
    .promise()
    .query(
      "SELECT item_id, qty FROM shop_inventory WHERE user_id = ? AND qty > 0",
      [userId],
    );
  const [profileRows] = await db
    .promise()
    .query("SELECT title FROM shop_profile WHERE user_id = ?", [userId]);

  if (rows.length === 0) {
    return `🎒 Your inventory is empty. Visit *.shop* to buy something!`;
  }

  let msg = `🎒 *Your Inventory*\n\n`;
  rows.forEach(({ item_id, qty }) => {
    const item = getItem(item_id);
    msg += `• ${item ? item.name : item_id} x${qty}\n`;
  });
  if (profileRows[0]?.title) msg += `\n🏷 Title: *${profileRows[0].title}*`;
  return msg;
}

/** .sell <item_id> — sell an item back for 50% of price */
async function sellItem(userId, itemId) {
  const item = getItem((itemId || "").trim());
  if (!item) return { ok: false, message: `❌ Item not found.` };

  const db = getDb();
  const [rows] = await db
    .promise()
    .query("SELECT qty FROM shop_inventory WHERE user_id = ? AND item_id = ?", [
      userId,
      item.id,
    ]);

  if (!rows.length || rows[0].qty <= 0) {
    return { ok: false, message: `❌ You don't own *${item.name}*.` };
  }

  await db
    .promise()
    .query(
      "UPDATE shop_inventory SET qty = qty - 1 WHERE user_id = ? AND item_id = ?",
      [userId, item.id],
    );

  const refund = Math.floor(item.price * 0.5);
  await economy.addBalance(userId, refund);

  return {
    ok: true,
    message: `✅ Sold *${item.name}* for ${economy.fmt(refund)} (50% refund).`,
  };
}

/** .settitle <text> — requires owning the custom_title item */
async function setTitle(userId, title) {
  const db = getDb();
  const [rows] = await db
    .promise()
    .query("SELECT qty FROM shop_inventory WHERE user_id = ? AND item_id = ?", [
      userId,
      "custom_title",
    ]);

  if (!rows.length || rows[0].qty <= 0) {
    return {
      ok: false,
      message: `❌ You need to buy the 🏷 Custom Title item first (*.buy custom_title*).`,
    };
  }
  if (!title || title.trim().length === 0) {
    return { ok: false, message: `❌ Usage: .settitle <your title text>` };
  }

  const cleanTitle = title.trim().slice(0, 30);
  await db.promise().query(
    `INSERT INTO shop_profile (user_id, title) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title)`,
    [userId, cleanTitle],
  );

  return { ok: true, message: `✅ Title set to: *${cleanTitle}*` };
}

async function hasItem(userId, itemId) {
  const db = getDb();
  const [rows] = await db
    .promise()
    .query("SELECT qty FROM shop_inventory WHERE user_id = ? AND item_id = ?", [
      userId,
      itemId,
    ]);
  return !!(rows.length && rows[0].qty > 0);
}

module.exports = {
  SHOP_ITEMS,
  initTables,
  listShop,
  buyItem,
  showInventory,
  sellItem,
  setTitle,
  hasItem,
};
