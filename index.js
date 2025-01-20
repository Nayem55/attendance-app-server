const express = require("express");
const cron = require("node-cron");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const moment = require("moment");
const { default: axios } = require("axios");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

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

// async function markAbsences() {
//   try {
//     const usersCollection = client.db("attendance").collection("users");
//     const checkins = client.db("attendance").collection("checkins");

//     // Get yesterday's date in Asia/Dhaka timezone
//     const yesterday = dayjs()
//       .tz("Asia/Dhaka")
//       .subtract(1, "day")
//       .format("YYYY-MM-DD HH:mm:ss");

//     // Fetch all users
//     const users = await usersCollection.find().toArray();

//     for (const user of users) {
//       const userIdString = user._id.toString();

//       // Check if the user has already checked in for the previous day by extracting the date from the time field
//       const attendanceRecord = await checkins.findOne({
//         userId: userIdString,
//         time: { $regex: `^${yesterday}` }, // Match the start of the time string with the formatted date (YYYY-MM-DD)
//       });

//       const checkInData = {
//         userId: userIdString,
//         date: "",
//         note: "",
//         image: "",
//         time: yesterday, // Leave empty or set appropriately
//         location: "",
//         status: "Absent",
//       };

//       if (!attendanceRecord) {
//         // Create an "absent" attendance record
//         await checkins.insertOne(checkInData);
//         console.log(`Marked absent for user: ${user._id} on ${yesterday}`);
//       }
//     }

//     console.log("Automatic absence marking completed for yesterday.");
//   } catch (error) {
//     console.error("Error while marking absences:", error);
//   } finally {
//     await client.close();
//   }
// }
// cron.schedule("0 0 * * *", markAbsences);

async function run() {
  try {
    const users = client.db("attendance").collection("users");
    const checkins = client.db("attendance").collection("checkins");
    const checkouts = client.db("attendance").collection("checkouts");
    const holidays = client.db("attendance").collection("holidays");
    const workingdays = client.db("attendance").collection("working-days");
    const leaveRequests = client.db("attendance").collection("leaveRequests");

    app.put("/api/checkins/add-status", async (req, res) => {
      try {
        // Update all documents by setting the `status` field to "Approved"
        const result = await checkins.updateMany(
          {},
          { $set: { status: "Approved" } }
        );

        res.status(200).json({
          message: "Status field added and updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating checkins:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
    app.put("/update-checkout-status", async (req, res) => {
      try {
        // Fetch all documents from the checkouts collection
        const checkoutCollection = await checkouts.find({}).toArray();
    
        const bulkOperations = checkoutCollection.map((checkout) => {
          const checkoutTime = dayjs(checkout.time, "YYYY-MM-DD HH:mm:ss");
          const cutoffTime = dayjs(checkout.time.split(' ')[0] + " 20:00:00", "YYYY-MM-DD HH:mm:ss");
    
          // Determine status based on checkout time
          const status = checkoutTime.isAfter(cutoffTime) ? "Overtime" : "Success";
    
          return {
            updateOne: {
              filter: { _id: checkout._id },
              update: { $set: { status } },
            },
          };
        });
    
        // Perform bulk update
        const result = await checkouts.bulkWrite(bulkOperations);
    
        res.status(200).json({
          message: "Checkout statuses updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating checkouts:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
    //bulk delete
    app.delete("/bulk-delete", async (req, res) => {
      try {
        // Specify the cutoff date
        const cutoffDate = dayjs("2025-01-01", "YYYY-MM-DD").format("YYYY-MM-DD HH:mm:ss");
    
        // Perform bulk deletion of records before the cutoff date
        const result = await checkins.deleteMany({
          time: { $lt: cutoffDate }, // Compare using string-based format
        });
    
        res.status(200).json({
          message: "Records deleted successfully",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        console.error("Error deleting records:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });
    
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
        _id: result.insertedId, // Access the insertedId from the result
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
            _id: user._id,
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
    // app.post("/checkin", async (req, res) => {
    //   const { userId, note, image, time, date, location, status } = req.body;

    //   try {
    //     // Find the user by userId
    //     const user = await users.findOne({ _id: new ObjectId(userId) });

    //     if (!user) {
    //       return res.status(404).json({ message: "User not found" });
    //     }

    //     // Check if the user has already checked in on the same date
    //     const existingCheckIn = await checkins.findOne({ userId, date });

    //     if (existingCheckIn) {
    //       return res.status(400).json({
    //         message:
    //           "You have already checked in today. Multiple check-ins are not allowed.",
    //       });
    //     }

    //     // Save check-in details to the database
    //     const checkInData = {
    //       userId,
    //       note,
    //       image,
    //       time,
    //       date,
    //       location,
    //       status,
    //     };

    //     // Insert check-in data into the 'checkins' collection
    //     await checkins.insertOne(checkInData);

    //     // Update the user's checkIn status in the 'users' collection
    //     await users.updateOne(
    //       { _id: new ObjectId(userId) },
    //       { $set: { checkIn: true, lastCheckedIn: time } }
    //     );

    //     res.status(200).json({ message: "Check-in successful" });
    //   } catch (error) {
    //     console.error("Error during check-in:", error);
    //     res.status(500).json({ message: "Internal server error" });
    //   }
    // });

    // app.post("/checkout", async (req, res) => {
    //   const { userId, note, image, time, date, location } = req.body;

    //   try {
    //     // Find the user
    //     const user = await users.findOne({ _id: new ObjectId(userId) });

    //     if (!user) {
    //       return res.status(404).json({ message: "User not found" });
    //     }

    //     // Prevent check-out if the user isn't checked in
    //     if (!user.checkIn) {
    //       return res.status(400).json({
    //         message: "You are not checked in. Please check in first.",
    //       });
    //     }

    //     // Save check-out details to the database (similar to check-in)
    //     const checkOutData = {
    //       userId,
    //       note,
    //       image,
    //       time,
    //       date,
    //       location,
    //       status: "Approved",
    //     };

    //     await checkouts.insertOne(checkOutData);

    //     // Update user's checked-in status to false
    //     await users.updateOne(
    //       { _id: new ObjectId(userId) },
    //       { $set: { checkIn: false } }
    //     );

    //     res.status(200).json({ message: "Check-out successful" });
    //   } catch (error) {
    //     console.error("Check-out error:", error);
    //     res.status(500).json({ message: "Internal server error" });
    //   }
    // });

    app.post("/checkin", async (req, res) => {
      const { userId, note, image, time, date, location, status } = req.body;
    
      try {
        const { latitude, longitude } = location;
    
        // Check if the user has already checked in today
        const existingCheckIn = await checkins.findOne({ userId, date });
        if (existingCheckIn) {
          return res.status(400).json({
            message:
              "You have already checked in today. Multiple check-ins are not allowed.",
          });
        }
    
        // Use Google Geocoding API to get the place name based on latitude and longitude
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyC60piOoQ9-iqUpayrs2GY73vCYnpKLmG0`;
    
        // Send request to Google Geocoding API for reverse geocoding
        const geocodeResponse = await axios.get(geocodeUrl);
        
        const placeName = geocodeResponse.data.results[0]?.formatted_address || "Unknown location";
    
        // Find the user by userId
        const user = await users.findOne({ _id: new ObjectId(userId) });
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }
    
        // Save check-in details to the database
        const checkInData = {
          userId,
          note,
          image,
          time,
          date,
          location: placeName, // Save the place name instead of lat/lng
          status,
        };
    
        await checkins.insertOne(checkInData);
    
        // Update the user's check-in status
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
    
    app.get("/api/checkouts/:userId", async (req, res) => {
      const userId = req.params.userId.toString();
      const { month, year, date } = req.query; // Accept month, year, or date as query parameters

      try {
        // If date is provided, filter by today's date
        if (date) {
          const today = moment(date)
            .startOf("day")
            .format("YYYY-MM-DD HH:mm:ss");
          const endOfDay = moment(date)
            .endOf("day")
            .format("YYYY-MM-DD HH:mm:ss");

          // Fetch check-ins for today's date
          const todayCheckouts = await checkouts
            .find({
              userId: userId,
              time: { $gte: today, $lte: endOfDay },
            })
            .toArray();

          return res.json(todayCheckouts); // Return today's check-ins
        }

        // If month and year are provided, filter by month and year
        if (month && year) {
          const startOfMonth = moment(`${year}-${month}-01`)
            .startOf("month")
            .startOf("day")
            .format("YYYY-MM-DD HH:mm:ss");
          const endOfMonth = moment(`${year}-${month}-01`)
            .endOf("month")
            .endOf("day")
            .format("YYYY-MM-DD HH:mm:ss");

          // Fetch check-ins for the specified month and year
          const Totalcheckouts = await checkouts
            .find({
              userId: userId,
              time: { $gte: startOfMonth, $lte: endOfMonth },
            })
            .toArray();

          return res.json(Totalcheckouts); // Return check-ins for the specified month
        }

        // If neither month/year nor date are provided, send a bad request
        return res
          .status(400)
          .json({ error: "Month, year, or date are required" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
      }
    });

    app.post("/checkout", async (req, res) => {
      const { userId, note, image, time, date, location, status } = req.body;

      try {
        // Reverse geocoding with Google Geocoding API
        const { latitude, longitude } = location;
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyC60piOoQ9-iqUpayrs2GY73vCYnpKLmG0`;

        const geocodeResponse = await axios.get(geocodeUrl);
        const placeName = geocodeResponse.data.results[0]?.formatted_address || "Unknown location";

        // Find the user by userId
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

        // Save check-out details to the database
        const checkOutData = {
          userId,
          note,
          image,
          time,
          date,
          location: placeName, // Save the place name instead of lat/lng
          status,
        };

        await checkouts.insertOne(checkOutData);

        // Update the user's check-in status to false
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

    app.get("/api/checkins/:userId", async (req, res) => {
      const userId = req.params.userId.toString();
      const { month, year, date } = req.query; // Accept month, year, or date as query parameters

      try {
        // If date is provided, filter by today's date
        if (date) {
          const today = moment(date)
            .startOf("day")
            .format("YYYY-MM-DD HH:mm:ss");
          const endOfDay = moment(date)
            .endOf("day")
            .format("YYYY-MM-DD HH:mm:ss");

          // Fetch check-ins for today's date
          const todayCheckins = await checkins
            .find({
              userId: userId,
              time: { $gte: today, $lte: endOfDay },
            })
            .toArray();

          return res.json(todayCheckins); // Return today's check-ins
        }

        // If month and year are provided, filter by month and year
        if (month && year) {
          const startOfMonth = moment(`${year}-${month}-01`)
            .startOf("month")
            .startOf("day")
            .format("YYYY-MM-DD HH:mm:ss");
          const endOfMonth = moment(`${year}-${month}-01`)
            .endOf("month")
            .endOf("day")
            .format("YYYY-MM-DD HH:mm:ss");

          // Fetch check-ins for the specified month and year
          const Totalcheckins = await checkins
            .find({
              userId: userId,
              time: { $gte: startOfMonth, $lte: endOfMonth },
            })
            .toArray();

          return res.json(Totalcheckins); // Return check-ins for the specified month
        }

        // If neither month/year nor date are provided, send a bad request
        return res
          .status(400)
          .json({ error: "Month, year, or date are required" });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
      }
    });

    //Update checkin status

    app.put("/api/update-status/:reportId", async (req, res) => {
      const reportId = req.params.reportId; // Extract the report ID from the URL
      const { status } = req.body; // Extract the new status from the request body

      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      try {
        // Update the status field in the checkins collection
        const result = await checkins.updateOne(
          { _id: new ObjectId(reportId) }, // Match the document by its ID
          { $set: { status } } // Update the status field
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Check-in report not found" });
        }

        res.status(200).json({
          message: `Check-in status updated to '${status}' successfully.`,
        });
      } catch (error) {
        console.error("Error updating check-in status:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/getAllUser", async (req, res) => {
      try {
        const { role, group, zone } = req.query; // Get role, group, and zone from query parameters
        let query = {};
    
        // Add filters based on the provided parameters
        if (role) {
          query.role = role;
        }
        if (group) {
          query.group = group;
        }
        if (zone) {
          query.zone = zone;
        }
    
        const user = await users.find(query).toArray();
    
        if (user.length > 0) {
          res.status(200).send(user);
        } else {
          res.status(404).send({ message: "No users found with the given filters" });
        }
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });
    
    
    app.post("/api/users", async (req, res) => {
        const newUser = req.body;
        const result = await users.insertOne(newUser);
        res.send(result);
    });

    app.delete("/api/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await users.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.status(200).send({ message: "User deleted successfully" });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send({ message: "Failed to delete user" });
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

    app.put("/updateUser/:userId", async (req, res) => {
      const userId = req.params.userId; // Extract userId from the route parameter
      let updatedData = req.body; // Data to update, sent in the request body

      try {
        // Remove the _id field from updatedData if it exists
        delete updatedData._id;

        // Update the user in the database
        const result = await users.updateOne(
          { _id: new ObjectId(userId) }, // Match the user by their ID
          { $set: updatedData } // Update the fields specified in the request body
        );

        if (result.modifiedCount > 0) {
          res.status(200).send({ message: "User updated successfully" });
        } else if (result.matchedCount > 0) {
          res.status(200).send({ message: "No changes made to the user" });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // Add a new holiday
    app.post("/api/holidays", async (req, res) => {
      const { name, date, description } = req.body;

      if (!name || !date) {
        return res.status(400).json({ message: "Name and date are required." });
      }

      try {
        const newHoliday = { name, date, description };
        const result = await holidays.insertOne(newHoliday);

        res.status(201).json({
          message: "Holiday added successfully",
          holiday: { ...newHoliday, _id: result.insertedId },
        });
      } catch (error) {
        console.error("Error adding holiday:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Fetch all holidays
    app.get("/api/holidays", async (req, res) => {
      try {
        const holidayList = await holidays.find({}).toArray();
        res.status(200).json(holidayList);
      } catch (error) {
        console.error("Error fetching holidays:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Fetch a single holiday by ID
    app.get("/api/holidays/:holidayId", async (req, res) => {
      const holidayId = req.params.holidayId;

      try {
        const holiday = await holidays.findOne({
          _id: new ObjectId(holidayId),
        });

        if (!holiday) {
          return res.status(404).json({ message: "Holiday not found" });
        }

        res.status(200).json(holiday);
      } catch (error) {
        console.error("Error fetching holiday:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Update a holiday
    app.put("/api/holidays/:holidayId", async (req, res) => {
      const holidayId = req.params.holidayId;
      const { name, date, description } = req.body;

      try {
        const updatedHoliday = {};
        if (name) updatedHoliday.name = name;
        if (date) updatedHoliday.date = date;
        if (description) updatedHoliday.description = description;

        const result = await holidays.updateOne(
          { _id: new ObjectId(holidayId) },
          { $set: updatedHoliday }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Holiday not found" });
        }

        res.status(200).json({ message: "Holiday updated successfully" });
      } catch (error) {
        console.error("Error updating holiday:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    // Delete a holiday
    app.delete("/api/holidays/:holidayId", async (req, res) => {
      const holidayId = req.params.holidayId;

      try {
        const result = await holidays.deleteOne({
          _id: new ObjectId(holidayId),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Holiday not found" });
        }

        res.status(200).json({ message: "Holiday deleted successfully" });
      } catch (error) {
        console.error("Error deleting holiday:", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

    app.get("/api/workingdays", async (req, res) => {
      try {
        const { month } = req.query; // Expecting a query parameter like `?month=2025-01`
        if (!month) {
          return res
            .status(400)
            .json({ error: "Month query parameter is required." });
        }

        // Fetch the working days for the specified month
        const workingDay = await workingdays.findOne({ month });

        if (!workingDay) {
          return res
            .status(404)
            .json({ error: "No working days data found for the given month." });
        }

        res.status(200).json(workingDay);
      } catch (error) {
        console.error("Error fetching working days:", error);
        res.status(500).json({ error: "Internal server error." });
      }
    });

    app.post("/api/leave-requests", async (req, res) => {
      try {
        const {
          userName,
          userId,
          phoneNumber,
          leaveStartDate,
          leaveEndDate,
          leaveReason,
          status,
        } = req.body;

        // Validate required fields
        if (
          !userName ||
          !userId ||
          !phoneNumber ||
          !leaveStartDate ||
          !leaveReason
        ) {
          return res
            .status(400)
            .json({ message: "All required fields must be provided." });
        }

        // Insert into the database
        const result = await leaveRequests.insertOne({
          userName,
          userId,
          phoneNumber,
          leaveStartDate: new Date(leaveStartDate),
          leaveEndDate: new Date(leaveEndDate || leaveStartDate), // Default end date to start date
          leaveReason,
          status: status || "pending", // Default status to "pending"
          createdAt: new Date(),
        });

        res.status(201).json({
          message: "Leave request created successfully",
          data: result.ops ? result.ops[0] : result,
        });
      } catch (error) {
        console.error("Error creating leave request:", error); // Log the error for debugging
        res.status(500).json({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    app.get("/api/leave-requests", async (req, res) => {
      try {
        const applications = await leaveRequests
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(applications);
      } catch (error) {
        console.error("Error fetching leave requests:", error);
        res
          .status(500)
          .json({ message: "Error fetching leave requests", error });
      }
    });
    app.get("/api/pending-requests", async (req, res) => {
      try {
        const pendingCount = await leaveRequests.countDocuments({
          status: "pending",
        });
        res.status(200).json({ pendingCount });
      } catch (error) {
        console.error("Error fetching pending leave requests count:", error);
        res.status(500).json({
          message: "Error fetching pending leave requests count",
          error,
        });
      }
    });

    app.put("/api/leave-requests/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body; // Status can be "approved" or "rejected"

      try {
        const result = await leaveRequests.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: "Leave request not found" });
        }

        res
          .status(200)
          .json({ message: "Leave request status updated successfully!" });
      } catch (error) {
        console.error("Error updating leave request status:", error);
        res
          .status(500)
          .json({ message: "Error updating leave request status", error });
      }
    });

    app.delete("/api/leave-requests/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await leaveRequests.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Leave request not found" });
        }

        res
          .status(200)
          .json({ message: "Leave request deleted successfully!" });
      } catch (error) {
        console.error("Error deleting leave request:", error);
        res
          .status(500)
          .json({ message: "Error deleting leave request", error });
      }
    });

    app.get("/api/leave-requests/user/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        const Applications = await leaveRequests
          .find({ userId })
          .sort({ createdAt: -1 })
          .toArray();

        if (Applications.length === 0) {
          return res
            .status(404)
            .json({ message: "No leave requests found for this user." });
        }

        res.status(200).json(Applications);
      } catch (error) {
        console.error("Error fetching leave requests for user:", error);
        res
          .status(500)
          .json({ message: "Error fetching leave requests", error });
      }
    });
    
    app.get("/api/leave-requests/user/:userId/monthly", async (req, res) => {
      const { userId } = req.params;
      const { month, year } = req.query;
    
      if (!month || !year) {
        return res.status(400).json({ message: "Month and year are required." });
      }
    
      try {
        const leaveRequestsCollection = await leaveRequests;
    
        // Define the start and end dates for the month
        const startDate = new Date(`${year}-${month}-01T00:00:00.000Z`);
        const endDate = new Date(startDate);
        endDate.setMonth(startDate.getMonth() + 1); // Add 1 month to the startDate
        endDate.setDate(0); // Move to the last day of the previous month, which is the last day of the selected month
    
        // Fetch all approved leaves for the given user
        const approvedLeaves = await leaveRequestsCollection
          .find({
            userId,
            status: "approved",
            $or: [
              {
                // Overlap with the month by checking if the leave starts before the month ends and ends after the month starts
                leaveStartDate: { $lt: endDate, $gte: startDate },
              },
              {
                // Overlap with the month by checking if the leave ends before the month ends and starts after the month starts
                leaveEndDate: { $lt: endDate, $gte: startDate },
              },
              {
                // Covers the case where the leave period spans the whole month
                leaveStartDate: { $lte: startDate },
                leaveEndDate: { $gte: endDate },
              },
            ],
          })
          .toArray();
    
        // Calculate the total leave days within the given month
        const totalLeaveDays = approvedLeaves.reduce((totalDays, leave) => {
          const leaveStart = new Date(leave.leaveStartDate);
          const leaveEnd = new Date(leave.leaveEndDate);
    
          // Adjust the effective start and end dates based on the selected month
          const effectiveStart = leaveStart < startDate ? startDate : leaveStart;
          const effectiveEnd = leaveEnd > endDate ? new Date(endDate) : leaveEnd; // Fix: endDate should be included
    
          // Calculate the number of days in the leave period within the selected month
          const daysCount =
            Math.ceil((effectiveEnd - effectiveStart + 1) / (1000 * 60 * 60 * 24)) > 0
              ? Math.ceil((effectiveEnd - effectiveStart + 1) / (1000 * 60 * 60 * 24))
              : 0;
    
          return totalDays + daysCount;
        }, 0);
    
        res.status(200).json({ leaveDays: totalLeaveDays });
    
      } catch (error) {
        console.error("Error fetching leave requests:", error);
        res.status(500).json({ message: "Error fetching leave requests", error });
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
