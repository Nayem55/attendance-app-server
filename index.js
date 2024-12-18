const express = require("express");
const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors()); // Allow cross-origin requests

// MongoDB connection
const mongoURI =
  "mongodb+srv://Attendance:Attendance@attendance.duzp7.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
let db;

client
  .connect()
  .then(() => {
    db = client.db("attendance");
    console.log("Connected to MongoDB!");
  })
  .catch((err) => {
    console.error("MongoDB connection error: ", err);
  });

// Sign-up Route
app.post("/signup", async (req, res) => {
  const { email, password, name, number } = req.body;

  // Check if user already exists
  const userExists = await db.collection("users").findOne({ email });
  if (userExists) {
    return res.status(400).json({ message: "User already exists!" });
  }

  // Insert user into DB
  const newUser = { email, password, name, number };
  await db.collection("users").insertOne(newUser);

  res.status(200).json({ message: "User created successfully!" });
});

// Login Route
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await db.collection("users").findOne({ email });
  if (!user) {
    return res.status(400).json({ message: "User not found!" });
  }

  // Compare plain text password
  if (user.password !== password) {
    return res.status(400).json({ message: "Invalid credentials!" });
  }

  res.status(200).json({ message: "Login successful!" });
});

// Check-in Route
app.post("/checkin", async (req, res) => {
  const { userId, time, date, location, note, image } = req.body;

  try {
    // Insert check-in data into DB
    const newCheckin = {
      userId,
      time,
      date,
      location,
      note,
      image,
    };
    
    await db.collection("checkins").insertOne(newCheckin);
    res.status(201).json({ message: "Check-in recorded successfully!" });
  } catch (error) {
    console.error("Error saving check-in:", error);
    res.status(500).json({ message: "Error saving check-in data" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
