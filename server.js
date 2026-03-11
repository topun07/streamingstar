const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs'); 

// Middleware to restrict access to admin pages
function requireLogin(req, res, next) {
    if (req.session.isLoggedIn) {
        next(); // User is logged in, continue
    } else {
        res.redirect('/admin/login'); // Not logged in, redirect to login page
    }
}

// --- NEW IMPORTS ---
require('dotenv').config(); // Load environment variables from .env
const fetch = require('node-fetch'); 
const app = express();
const port = process.env.PORT;

// --- MIDDLEWARE ---
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Serve files from the 'uploads' directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve files from the 'image' directory
app.use('/image', express.static(path.join(__dirname, 'image'))); 

app.use(session({
    secret: 'sleekpleasures', 
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Session lasts 24 hours
}));

// Define the Administrator Account
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD_HASH = '$2b$10$XsKKt5twtUDYNh3pKzYhLuPMQAzygLIzV.TkeU2I8x/mao1q5fEH6'; // Hash for "@Metallica3"

// --- CONFIGURATION ---
const isProduction = process.env.NODE_ENV === 'production';
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10, // Recommended pool size
    queueLimit: 0
});

// =========================================================
// === NEW GLOBAL DATABASE UTILITY FUNCTIONS (4B, 4C, 4D)===
// =========================================================

/**
 * Deletes an applicant record by ID.
 * @param {number} applicantId - The ID of the applicant to delete.
 */
async function deleteApplicant(applicantId) {
    const query = 'DELETE FROM applicants WHERE id = ?';
    // Use pool.execute() for parameterized statements
    const [result] = await pool.execute(query, [applicantId]); 
    return result;
}

/**
 * Updates an applicant's pass/fail status.
 * @param {number} applicantId - The ID of the applicant.
 * @param {string} newStatus - 'Pass' or 'Fail'.
 */
async function updateStatus(applicantId, newStatus) {
    const query = 'UPDATE applicants SET status = ? WHERE id = ?';
    const [result] = await pool.execute(query, [newStatus, applicantId]);
    return result;
}

/**
 * Toggles an applicant's star status.
 * @param {number} applicantId - The ID of the applicant.
 * @param {boolean} starStatus - true or false.
 */
async function toggleStar(applicantId, starStatus) { 
    const query = 'UPDATE applicants SET is_starred = ? WHERE id = ?';
    const [result] = await pool.execute(query, [starStatus, applicantId]);
    return result;
}

// --- REST OF CODE (Multer, Routes, etc.) ---

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;

const UPLOAD_FOLDER = 'uploads/';
fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_FOLDER);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Function to filter files
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
        cb(null, true); 
    } else {
        cb(new Error('Invalid file type. Only JPEG and PNG image files are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter 
});

// --- ROUTES ---

// The main submission route handles Multer and validation.
app.post('/submit', (req, res) => {
    // 1. Multer Wrapper
    upload.fields([
        { name: 'photo1', maxCount: 1 },
        { name: 'photo2', maxCount: 1 },
        { name: 'photo3', maxCount: 1 },
        { name: 'photo4', maxCount: 1 },
        { name: 'photo5', maxCount: 1 }
    ])(req, res, async (err) => { 
        
        // --- A. HANDLE FILE UPLOAD ERRORS ---
        if (err instanceof multer.MulterError) {
            console.error('Multer Error:', err.message);
            return res.status(400).send(`File upload error: ${err.message}`);
        } else if (err) {
            console.error('File Filter Error:', err.message);
            return res.status(400).send(`File upload error: ${err.message}`);
        }

        const { name, dob, email, phone, gender, facebook, instagram, onlyfans, outcome } = req.body;
        
        // --- B. Age Check ---
        const now = new Date();
        const birthDate = new Date(dob);
        let age = now.getFullYear() - birthDate.getFullYear();
        const m = now.getMonth() - birthDate.getMonth();
        
        // Adjust age if birthday hasn't passed this year
        if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
            age--;
        }

        if (age < 17) {
            return res.status(400).send('<h1>Age Restriction</h1><p>We are sorry, but applicants must be 17 years of age or older to submit an application.</p><a href="/">Go Back</a>');
        }

        // --- C. CAPTCHA Verification Check ---
        const captchaResponse = req.body['g-recaptcha-response'];
        if (!captchaResponse) {
            return res.status(400).send('CAPTCHA verification failed. Please check the box.');
        }

        const verificationURL = `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${captchaResponse}`;

        // START of the main try block (CAPCHA and DB)
        try {
            const captchaResult = await fetch(verificationURL, { method: 'POST' }).then(r => r.json());

            if (!captchaResult.success) {
                return res.status(400).send('Robot verification failed. Please try again.');
            }

            // Get file paths from the multer response
            const files = req.files;
            const photo1_path = files['photo1'] ? files['photo1'][0].path : null;
            const photo2_path = files['photo2'] ? files['photo2'][0].path : null;
            const photo3_path = files['photo3'] ? files['photo3'][0].path : null;
            const photo4_path = files['photo4'] ? files['photo4'][0].path : null;
            const photo5_path = files['photo5'] ? files['photo5'][0].path : null;

            // --- DATABASE LOGIC (MySQL) ---
            
            // 1. Delete older submission based on Name and DOB
            const deleteQuery = `
                DELETE FROM applicants
                WHERE name = ? AND dob = ?;
            `;
            await pool.execute(deleteQuery, [name, dob]);


            // 2. INSERT NEW (LATEST) SUBMISSION
            const insertQuery = `
                INSERT INTO applicants (
                    name, dob, email, phone_number, gender, facebook_profile, instagram_handle,
                    onlyfans_profile, desired_outcome, photo_path_1,
                    photo_path_2, photo_path_3, photo_path_4, photo_path_5
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `;

            const values = [
                name, dob, email, phone, gender, facebook, instagram, onlyfans,
                outcome, photo1_path, photo2_path, photo3_path, photo4_path, photo5_path 
            ];

            await pool.execute(insertQuery, values);
            
            // --- SUCCESS RESPONSE ---
            res.status(200).send(`
                <div style="text-align: center; padding: 50px; font-family: sans-serif; max-width: 600px; margin: 50px auto; border: 1px solid #E0B0FF; border-radius: 10px; box-shadow: 0 4px 15px rgba(138, 43, 226, 0.1);">
                    
                    <img src="/image/logo_purple.png" alt="Streaming Star Dallas Logo" style="max-height: 100px; margin-bottom: 20px;">
                    
                    <h2 style="color: #8A2BE2;">Application Submitted Successfully!</h2>
                    <p style="font-size: 1.1em;">Thank you for your interest in Streaming Star Dallas.</p>
                    <p>We will be reviewing your submission shortly. If your profile is chosen, we will be contacting you soon to discuss the next steps.</p>
                    <p style="margin-top: 30px;">For any urgent inquiries, please contact our support team at:</p>
                    <p style="font-weight: bold; font-size: 1.2em; color: #8A2BE2;"><a href="mailto:support@streamingstardallas.com">support@streamingstardallas.com</a></p>
                    <a href="/" style="display: inline-block; margin-top: 40px; padding: 10px 20px; background-color: #8A2BE2; color: white; text-decoration: none; border-radius: 5px;">Submit another application</a>
                </div>
            `);

        // END of the main try block
        } catch (err) { // This single catch block handles both CAPTCHA and DB errors
            console.error('Submission Error:', err);
            
            // Handle unique constraint violation (Database Error)
            if (err.code === 'ER_DUP_ENTRY') { 
                return res.status(400).send('Submission Failed: This email address is already registered.');
            }
            // Handle ReCAPTCHA API or other general network/server errors
            res.status(500).send('Submission Failed: Server Error during verification or database insertion.');
        }

    }); // <--- Close the Multer wrapper
}); 
// ... (rest of your routes, which look good!) ...

// Display Login Page
app.get('/admin/login', (req, res) => {
    // ... (Login page code) ...
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Admin Login</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>body { background-color: #f8f9fa; }</style>
        </head>
        <body>
            <div class="container mt-5">
                <div class="row justify-content-center">
                    <div class="col-md-6">
                        <div class="card shadow">
                            <div class="card-header bg-primary text-white">Admin Login</div>
                            <div class="card-body">
                                <form action="/admin/login" method="POST">
                                    <div class="mb-3">
                                        <label for="username" class="form-label">Username</label>
                                        <input type="text" class="form-control" id="username" name="username" required>
                                    </div>
                                    <div class="mb-3">
                                        <label for="password" class="form-label">Password</label>
                                        <input type="password" class="form-control" id="password" name="password" required>
                                    </div>
                                    <button type="submit" class="btn btn-primary w-100">Log In</button>
                                    ${req.query.error ? '<p class="text-danger mt-3">Invalid credentials.</p>' : ''}
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `);
});

// Handle Login Submission
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER) {
        // Compare submitted password with the stored hash
        const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
        
        if (isMatch) {
            req.session.isLoggedIn = true;
            return res.redirect('/admin/dashboard');
        }
    }
    // Invalid credentials
    res.redirect('/admin/login?error=true');
});

// Handle Logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Session destruction error:', err);
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/');
    });
});

// Admin Dashboard Page (Protected)
app.get('/admin/dashboard', requireLogin, async (req, res) => {

    try {
        
        // Fetch all data, ordered by newest submission first
        // Note: For MySQL, ORDER BY submission_timestamp DESC is fine.
        const [rows] = await pool.execute('SELECT * FROM applicants ORDER BY submission_timestamp DESC');
        const applicants = rows; // MySQL returns the rows in the first element of the array.

        // Start building the HTML response
        let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Admin Dashboard</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>
                    body { background-color: #f8f9fa; }
                    /* Increase photo preview max-width to accommodate more photos */
                    .photo-preview { max-width: 80px; height: auto; margin-top: 10px; } 
                </style>
            </head>
            <body>
                <div class="container-fluid mt-4">
                    
                    <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
                        <h1 class="h2 m-0 d-flex align-items-center">
                            <img src="/image/logo_purple.png" alt="Streaming Star Dallas Logo" style="max-height: 50px;" class="me-3">
                            Applicant Dashboard (${applicants.length})
                        </h1>
                        <a href="/admin/logout" class="btn btn-danger">Log Out</a>
                    </div>
                    
                    <div class="table-responsive">
                    <table class="table table-striped table-bordered table-sm">
                        <thead class="bg-dark text-white">
                            <tr>
                                <th>Contact Info</th>
                                <th>Socials</th>
                                <th>Outcome</th>
                                <th>Photos</th>
                                <th>Age</th> </tr>
                        </thead>
                        <tbody>
        `;

        // Iterate over applicants and build table rows
        applicants.forEach(app => {
            // 🛑 ADJUSTMENT 2: Age Calculation Logic
            const now = new Date();
            const birthDate = new Date(app.dob);
            let age = now.getFullYear() - birthDate.getFullYear();
            const m = now.getMonth() - birthDate.getMonth();
            
            if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
                age--;
            }
            // END Age Calculation

            // Iterate up to 5 photos now
            let photosHtml = '';
            for (let i = 1; i <= 5; i++) {
                const pathKey = `photo_path_${i}`;
                const photoPath = app[pathKey];
                if (photoPath) {
                    const filename = photoPath.split('/').pop().split('\\').pop();
                    photosHtml += `<a href="/uploads/${filename}" target="_blank">
                                        <img src="/uploads/${filename}" class="photo-preview me-1" alt="Photo ${i}">
                                   </a>`;
                }
            }

            html += `
                <tr>
                    <td>
                        <strong>${app.name}</strong><br>
                        <small>Email: ${app.email}</small><br>
                        <small>Phone: ${app.phone_number}</small><br>
                        <small>DOB: ${app.dob}</small><br>
                        <small>Gender: ${app.gender}</small>
                    </td>
                    <td>
                        ${app.facebook_profile ? `<a href="${app.facebook_profile}" target="_blank">Facebook</a><br>` : ''}
                        ${app.instagram_handle ? `IG: ${app.instagram_handle}<br>` : ''}
                        ${app.onlyfans_profile ? `<a href="${app.onlyfans_profile}" target="_blank">OnlyFans</a>` : ''}
                    </td>
                    <td>${app.desired_outcome}</td>
                    <td>${photosHtml}</td>
                    <td><strong>${age}</strong></td> </tr>
            `;
        });

        html += `
                        </tbody>
                    </table>
                    </div>
                </div>
            </body>
            </html>
        `;

        res.send(html);

    } catch (err) {
        console.error('Dashboard Database Error:', err);
        res.status(500).send('Error loading dashboard data.');
    } 
});

// =========================================================
// === NEW ADMIN ACTION ROUTES (4B, 4C, 4D Implementation) ===
// =========================================================

// DELETE Applicant Entry
app.delete('/api/admin/applicant/:id', requireLogin, async (req, res) => {
    const applicantId = req.params.id;
    try {
        await deleteApplicant(applicantId);
        res.status(200).send({ message: `Applicant ${applicantId} deleted.` });
    } catch (err) {
        console.error('API Deletion Error:', err);
        res.status(500).send({ error: 'Failed to delete applicant.' });
    }
});

// UPDATE Pass/Fail Status
app.post('/api/admin/status/:id', requireLogin, async (req, res) => {
    const applicantId = req.params.id;
    const { status } = req.body; // Expects { status: 'Pass' } or { status: 'Fail' }
    try {
        await updateStatus(applicantId, status);
        res.status(200).send({ message: `Applicant ${applicantId} status updated to ${status}.` });
    } catch (err) {
        console.error('API Status Update Error:', err);
        res.status(500).send({ error: 'Failed to update status.' });
    }
});

// TOGGLE Star Status
app.post('/api/admin/star/:id', requireLogin, async (req, res) => {
    const applicantId = req.params.id;
    const { is_starred } = req.body; // Expects { is_starred: true } or { is_starred: false }
    try {
        await toggleStar(applicantId, is_starred);
        res.status(200).send({ message: `Applicant ${applicantId} star status updated to ${is_starred}.` });
    } catch (err) {
        console.error('API Star Toggle Error:', err);
        res.status(500).send({ error: 'Failed to toggle star status.' });
    }
});

// 2. Simple Catch-all route to serve the form (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 3. NEW Route for Company Description Page
app.get('/company-description', (req, res) => {
    res.sendFile(path.join(__dirname, 'company-description.html'));
});


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});