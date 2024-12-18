const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
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
const client = new MongoClient(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
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
    const newUser = { email, password, name, number, checkIn: false };
    const result = await db.collection("users").insertOne(newUser);
  
    // Fetch the inserted user data using the insertedId
    const user = { 
      ...newUser,
      id: result.insertedId, // Access the insertedId from the result
    };
  
    res.status(200).json({
      message: "User created successfully",
      user: user, // Return the user object
    });
  });
  
  

// Login Route
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
  
    try {
      // Fetch user from the database
      const user = await db.collection("users").findOne({ email });
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // Verify password (use bcrypt for hashing comparison in production)
      const isPasswordCorrect = password === user.password; // In production, replace with bcrypt comparison
  
      if (!isPasswordCorrect) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
  
      // Return user details including the checked-in status
      res.status(200).json({
        message: "Login successful",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          number: user.number,
          checkIn: user.checkIn, // Send checkIn status
        },
      });
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  

// Check-in Route
app.post("/checkin", async (req, res) => {
    const { userId, note, image, time, date, location } = req.body;
  
    try {
      // Find the user by userId
      const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // Prevent duplicate check-ins if already checked in
      if (user.checkIn) {
        return res
          .status(400)
          .json({ message: "You are already checked in. Please check out first." });
      }
  
      // Save check-in details to the database
      const checkInData = {
        userId,
        note,
        image,
        time,
        date,
        location,
      };
  
      // Insert check-in data into the 'checkins' collection
      await db.collection("checkins").insertOne(checkInData);
  
      // Update the user's checkIn status in the 'users' collection
      await db.collection("users").updateOne(
        { _id: new ObjectId(userId) },
        { $set: { checkIn: true } }
      );
  
      res.status(200).json({ message: "Check-in successful" });
    } catch (error) {
      console.error("Error during check-in:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  

app.post("/checkout", async (req, res) => {
  const { userId, note, image, time, date, location } = req.body;

  try {
    // Find the user
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Prevent check-out if the user isn't checked in
    if (!user.checkIn) {
      return res
        .status(400)
        .json({ message: "You are not checked in. Please check in first." });
    }

    // Save check-out details to the database (similar to check-in)
    const checkOutData = {
      userId,
      note,
      image,
      time,
      date,
      location,
    };

    await db.collection("checkouts").insertOne(checkOutData);

    // Update user's checked-in status to false
    await db
      .collection("users")
      .updateOne(
        { _id: new ObjectId(userId) },
        { $set: { checkIn: false } }
      );

    res.status(200).json({ message: "Check-out successful" });
  } catch (error) {
    console.error("Check-out error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
