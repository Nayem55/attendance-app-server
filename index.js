const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const moment = require("moment");

require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(cors()); // Allow cross-origin requests

// MongoDB connection
const mongoURI =
  "mongodb+srv://Attendance:Attendance@attendance.duzp7.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const users = client.db("attendance").collection("users");
    const checkins = client.db("attendance").collection("checkins");
    const checkouts = client.db("attendance").collection("checkouts");

    // Sign-up Route
    app.post("/signup", async (req, res) => {
      const { email, password, name, number } = req.body;

      // Check if user already exists
      const userExists = await users.findOne({ email });
      if (userExists) {
        return res.status(400).json({ message: "User already exists!" });
      }

      // Insert user into DB
      const newUser = {
        email,
        password,
        name,
        number,
        checkIn: false,
        lastCheckedIn: "",
      };
      const result = await users.insertOne(newUser);

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
        const user = await users.findOne({ email });

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
            checkIn: user.checkIn,
            lastCheckedIn: user.lastCheckedIn,
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
        const user = await users.findOne({ _id: new ObjectId(userId) });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        // Prevent duplicate check-ins if already checked in
        if (user.checkIn) {
          return res.status(400).json({
            message: "You are already checked in. Please check out first.",
          });
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
        await checkins.insertOne(checkInData);

        // Update the user's checkIn status in the 'users' collection
        await users.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { checkIn: true, lastCheckedIn: time } }
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
        const user = await users.findOne({ _id: new ObjectId(userId) });

        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        // Prevent check-out if the user isn't checked in
        if (!user.checkIn) {
          return res.status(400).json({
            message: "You are not checked in. Please check in first.",
          });
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

        await checkouts.insertOne(checkOutData);

        // Update user's checked-in status to false
        await users.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { checkIn: false } }
        );

        res.status(200).json({ message: "Check-out successful" });
      } catch (error) {
        console.error("Check-out error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/api/checkins/current-month/:userId", async (req, res) => {
      const userId = req.params.userId.toString();

      try {
        const startOfMonth = moment()
          .startOf("month")
          .startOf("day")
          .format("YYYY-MM-DD HH:mm:ss"); // Start of the month at midnight
        const endOfMonth = moment()
          .endOf("month")
          .endOf("day")
          .format("YYYY-MM-DD HH:mm:ss"); // End of the month at 23:59:59

        // Fetch check-ins for the current month using the formatted date strings
        const Totalcheckins = await checkins
          .find({
            userId: userId,
            time: { $gte: startOfMonth, $lte: endOfMonth }, // Compare as strings
          })
          .toArray();

        // Return the check-in data for the current month
        res.json(Totalcheckins);
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
      }
    });

    app.get("/getUser/:userId", async (req, res) => {
      const userId = req.params.userId;
    
      try {
        const user = await users.findOne({ _id: new ObjectId(userId) });
    
        if (user) {
          res.status(200).send(user);
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });


  } finally {
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Server is runing");
});

app.listen(port, () => {
  console.log("Listening at port", port);
});
