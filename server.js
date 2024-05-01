const express = require("express");
const mysql = require("mysql2");
const ytdl = require("ytdl-core");
const cors = require("cors");
const WebSocket = require("ws");
const url = require("url"); // Import the url module for parsing request URLs
require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.API_KEY;

// Use cors middleware
app.use(cors());

// Create MySQL connection
const connection = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_DB,
});

// Connect to MySQL
connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    process.exit(1);
  }
  console.log("Connected to MySQL");
});

// Handle SIGINT (Ctrl+C) to gracefully close MySQL connection
process.on("SIGINT", () => {
  connection.end((err) => {
    if (err) {
      console.error("Error closing MySQL connection:", err);
    }
    console.log("MySQL connection closed");
    process.exit(0);
  });
});

// WebSocket server
const wss = new WebSocket.Server({ port: 8080 });
let currentSong = null;

// WebSocket connection handler
wss.on("connection", (ws, req) => {
  const parameters = url.parse(req.url, true);

  console.log("Client connected");

  if (currentSong) {
    ws.send(JSON.stringify(currentSong));
  }

  // Handle client disconnection
  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

// Update the currently playing song
function updateCurrentSong(song) {
  currentSong = song;

  // Broadcast the updated song to all connected clients
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(song));
    }
  });
}

// Route for playing a song
app.get("/playSong", async (req, res) => {
  try {
    // Fetch song data and set it as the current song
    const songData = await fetchSongData(req.query.songName);
    updateCurrentSong(songData);

    // Respond with the song data
    res.json(songData);
  } catch (error) {
    console.error("Error playing song:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Function to fetch song data
async function fetchSongData(songName) {
  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(
      songName
    )}&part=snippet&type=video&maxResults=1&key=${API_KEY}`
  );
  const data = await response.json();

  if (data && data.items && data.items.length > 0) {
    const videoId = data.items[0].id.videoId;
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    const title = data.items[0].snippet.title;
    const thumbnail = data.items[0].snippet.thumbnails.high.url;
    const owner = data.items[0].snippet.channelTitle;

    const audioFile = await convertToAudio(
      `https://www.youtube.com/watch?v=${videoId}`
    );

    return {
      title,
      embedUrl,
      thumbnail,
      owner,
      videoId,
      audioFile,
    };
  } else {
    throw new Error("No video found");
  }
}

// Function to convert YouTube video to audio
async function convertToAudio(youtubeUrl) {
  const info = await ytdl.getInfo(youtubeUrl);
  const audioFormat = ytdl.chooseFormat(info.formats, { filter: "audioonly" });
  return audioFormat.url;
}

// Route to check if a user exists
app.get("/userExists/:username", (req, res) => {
  const { username } = req.params;
  const sql = "SELECT * FROM userDB WHERE userName = ?";

  connection.query(sql, [username], (err, results) => {
    if (err) {
      console.error("Error querying database:", err);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    const exists = results.length > 0;
    res.json({ exists });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
module.exports = app;
