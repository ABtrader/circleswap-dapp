const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const USERS_FILE =
  process.env.USERS_FILE || path.join(__dirname, "users.json");

const corsOptions = {
  origin(origin, callback) {
    if (CLIENT_ORIGIN === "*" || !origin) {
      return callback(null, true);
    }

    const allowedOrigins = CLIENT_ORIGIN.split(",").map((item) =>
      item.trim()
    );

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

function ensureUsersFile() {
  const directory = path.dirname(USERS_FILE);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]");
  }
}

function readUsers() {
  try {
    ensureUsersFile();

    const data = fs.readFileSync(USERS_FILE, "utf8");

    if (!data) {
      return [];
    }

    const users = JSON.parse(data);

    return Array.isArray(users) ? users : [];
  } catch (error) {
    console.error("Read users failed:", error);
    return [];
  }
}

function saveUsers(users) {
  ensureUsersFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function normalizeUsername(username) {
  const clean = String(username || "").toLowerCase().trim();
  return clean.startsWith("@") ? clean : `@${clean}`;
}

function normalizeWallet(wallet) {
  return String(wallet || "").toLowerCase().trim();
}

function isValidWallet(wallet) {
  return /^0x[a-fA-F0-9]{40}$/.test(wallet);
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CircleSwap Username Registry Backend Running 🚀",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.get("/users", (req, res) => {
  const users = readUsers();

  res.json({
    success: true,
    count: users.length,
    users,
  });
});

app.post("/register", (req, res) => {
  try {
    const { username, wallet } = req.body;

    if (!username || !wallet) {
      return res.status(400).json({
        success: false,
        error: "username and wallet are required",
      });
    }

    const cleanUsername = normalizeUsername(username);
    const cleanWallet = normalizeWallet(wallet);

    if (cleanUsername.length <= 1) {
      return res.status(400).json({
        success: false,
        error: "Invalid username",
      });
    }

    if (!isValidWallet(cleanWallet)) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address",
      });
    }

    const users = readUsers();

    const usernameOwner = users.find(
      (user) => user.username === cleanUsername
    );

    const walletOwner = users.find((user) => user.wallet === cleanWallet);

    if (usernameOwner && usernameOwner.wallet !== cleanWallet) {
      return res.status(409).json({
        success: false,
        error: "This username is already linked to another wallet",
      });
    }

    if (walletOwner && walletOwner.username !== cleanUsername) {
      walletOwner.username = cleanUsername;
      walletOwner.updatedAt = new Date().toISOString();

      saveUsers(users);

      return res.json({
        success: true,
        user: walletOwner,
        message: "Wallet username updated successfully",
      });
    }

    if (usernameOwner && usernameOwner.wallet === cleanWallet) {
      return res.json({
        success: true,
        user: usernameOwner,
        message: "User already registered",
      });
    }

    const newUser = {
      username: cleanUsername,
      wallet: cleanWallet,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    users.push(newUser);
    saveUsers(users);

    return res.json({
      success: true,
      user: newUser,
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("Register failed:", error);

    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

app.post("/resolve", (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({
        success: false,
        error: "input required",
      });
    }

    const users = readUsers();
    const cleanInput = String(input).toLowerCase().trim();

    let foundUser = null;

    if (cleanInput.startsWith("@")) {
      foundUser = users.find((user) => user.username === cleanInput);
    } else if (cleanInput.startsWith("0x")) {
      foundUser = users.find((user) => user.wallet === cleanInput);
    } else {
      foundUser = users.find((user) => user.username === `@${cleanInput}`);
    }

    if (!foundUser) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    return res.json({
      success: true,
      user: foundUser,
    });
  } catch (error) {
    console.error("Resolve failed:", error);

    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

app.delete("/users/:username", (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);
    const users = readUsers();

    const nextUsers = users.filter((user) => user.username !== username);

    if (nextUsers.length === users.length) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    saveUsers(nextUsers);

    return res.json({
      success: true,
      message: `${username} removed from registry`,
    });
  } catch (error) {
    console.error("Delete failed:", error);

    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);

  return res.status(500).json({
    success: false,
    error: "Unexpected server error",
  });
});

app.listen(PORT, () => {
  console.log(`CircleSwap backend running on port ${PORT}`);
});