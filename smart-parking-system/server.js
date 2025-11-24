require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");

const app = express();
const PORT = 5000;

app.use(cors({ origin: "*" })); // Allow all origins (change for production)
app.use(bodyParser.json());
// 🔹 Debugging: Print .env values to check if they are loaded
console.log("🚀 Debug Logs:");
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "Loaded ✅" : "Not Loaded ❌");
console.log("ALLOWED_EMAIL:", process.env.ALLOWED_EMAIL);
console.log("SMTP_HOST:", process.env.SMTP_HOST);
console.log("SMTP_PORT:", process.env.SMTP_PORT);
console.log("DEBUG_MODE:", process.env.DEBUG_MODE || "Not Set");
// ✅ Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/Parkingpro", {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ Connected to MongoDB"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// ✅ Define User Schema
const UserSchema = new mongoose.Schema({
    fullname: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model("User", UserSchema);
const ContactSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String,
    date: { type: Date, default: Date.now }
}, { collection: "messages" }); // Force it to use the correct collection

const Contact = mongoose.model("Contact", ContactSchema);


// ✅ Register Route
app.post("/register", async (req, res) => {
    try {
        const { fullname, username, email, password, confirmPassword } = req.body;
        if (!fullname || !username || !email || !password || !confirmPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ fullname, username, email, password: hashedPassword });
        await newUser.save();
        console.log("✅ User Registered:", newUser);
        res.json({ success: true, message: "User registered successfully!" });
    } catch (error) {
        console.error("❌ Error Registering User:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: "Invalid username or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid username or password" });
        }

        const token = jwt.sign({ userId: user._id, username: user.username }, "your_secret_key", { expiresIn: "1h" });

        console.log("✅ User Logged In:", user.username);
        res.json({ success: true, message: "Login successful!", token, username: user.username });

    } catch (error) {
        console.error("❌ Login Error:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});



// ✅ OTP System (Temporary Storage)
const otpStore = new Map(); // Stores OTPs temporarily

// ✅ Nodemailer Transporter Configuration
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ✅ Send OTP Route
app.post("/send-otp", async (req, res) => {
    try {
        const { email } = req.body;
        console.log("✅ Received email for OTP:", email);
        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore.set(email, { otp, expiresAt: Date.now() + 5 * 60 * 1000 });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your OTP Code",
            text: `Your OTP for verification is: ${otp}`
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "OTP sent!" });

    } catch (error) {
        console.error("❌ Email Send Error:", error);
        res.status(500).json({ success: false, message: "Failed to send OTP", error: error.toString() });
    }
});


// ✅ Verify OTP Route
app.post("/verify-otp", (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log("📩 Received email for verification:", email);
        console.log("🔢 Received OTP:", otp);

        const storedOtpData = otpStore.get(email);
        console.log("🗃️ Stored OTP Data:", storedOtpData); // 🔥 Debug stored OTP

        if (!storedOtpData) {
            return res.status(400).json({ success: false, message: "OTP expired or not found" });
        }

        console.log("⏳ OTP Expiry Time:", storedOtpData.expiresAt, "Current Time:", Date.now());

        if (Date.now() > storedOtpData.expiresAt) {
            otpStore.delete(email);
            return res.status(400).json({ success: false, message: "OTP expired" });
        }

        console.log("🟢 Comparing Entered OTP:", parseInt(otp), "with Stored OTP:", storedOtpData.otp);

        if (parseInt(otp) !== storedOtpData.otp) {
            console.log("❌ OTP Mismatch");
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        otpStore.delete(email);
        console.log("✅ OTP Verified Successfully!");
        res.json({ success: true, message: "OTP verified successfully!" });

    } catch (error) {
        console.error("❌ OTP Verification Error:", error);
        res.status(500).json({ success: false, message: "OTP verification failed", error: error.toString() });
    }
});
app.post("/contact", async (req, res) => {
    try {
        const { name, email, message } = req.body;
        console.log("📬 Received Contact Form Submission:", { name, email, message });

        const newContact = new Contact({ name, email, message });
        await newContact.save();

        console.log("✅ Contact saved to MongoDB");
        res.status(201).json({ success: true, message: "Message received!" });
    } catch (err) {
        console.error("❌ Error saving contact:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// ✅ Booking Schema
const BookingSchema = new mongoose.Schema({
    user: String,
    slot: String,
    startTime: Date,
    expiryTime: Date,
    status: { type: String, default: "active" }   // ✅ active / cancelled / expired
});


const Booking = mongoose.model("Booking", BookingSchema);
// ✅ Save booking after OTP verification
app.post("/book-slot", async (req, res) => {
    try {
        const { user, slot, startTime, expiryTime } = req.body;

        const newBooking = new Booking({
        user,
        slot,
        startTime,
        expiryTime,
        status: "active"
         });


        await newBooking.save();
        res.json({ success: true, message: "Slot booked successfully!" });

    } catch (err) {
        console.error("❌ Booking Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// ✅ Get all active booked slots
app.get("/booked-slots", async (req, res) => {
    try {
        const now = new Date();

        const bookings = await Booking.find({
    expiryTime: { $gt: now },
    status: "active"
     });


        const bookedSlots = bookings.map(b => b.slot);

        res.json({ success: true, bookedSlots });

    } catch (err) {
        console.error("❌ Fetch Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// ✅ Cancel Booking
// ✅ Cancel Booking (FIXED)
app.post("/cancel-booking", async (req, res) => {
    try {
        const { user, slot } = req.body;  // 🔥 FIX: Extract from request

        const result = await Booking.updateOne(
            {
                user: user,
                slot: slot,
                status: "active",
                expiryTime: { $gt: new Date() }
            },
            {
                $set: { status: "cancelled" }
            }
        );

        if (result.modifiedCount === 0) {
            return res.json({ success: false, message: "No active booking found to cancel" });
        }

        res.json({ success: true, message: "Booking cancelled!" });

    } catch (err) {
        console.error("❌ Cancel Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// ✅ Booking History
app.post("/booking-history", async (req, res) => {
    try {
        const { user } = req.body;

        const history = await Booking.find({ user }).sort({ startTime: -1 });

        res.json({ success: true, history });

    } catch (err) {
        console.error("❌ History Fetch Error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});






// ✅ Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
