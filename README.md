# streamingstar
StreamingStar Dallas is a full-stack talent acquisition platform designed to streamline the application process for media performers. The application handles high-volume data submissions, including large media files, and provides a secure administrative dashboard for data management.

🛠️ Technical Stack
Frontend: HTML5, CSS3, JavaScript (Client-side validation).

Backend: Node.js with Express.js.

Database: PostgreSQL hosted on AWS RDS.

Infrastructure: AWS Elastic Beanstalk (Node.js 22 on Amazon Linux 2023).

Web Server: Nginx (Customized for high-capacity file uploads).

🌟 Key Features & Engineering Challenges
Automated Schema Migration: Developed custom .ebextensions to automate PostgreSQL table creation and configuration during deployment using psql client-tools.

Optimized Media Handling: Resolved 413 Request Entity Too Large errors by implementing a custom Nginx reverse-proxy configuration to support large file uploads (up to 10MB).

Secure Admin Portal: Integrated a protected administrative dashboard featuring BCrypt password hashing and session-based authentication to manage applicant data safely.

Cloud Infrastructure: Architected the deployment on AWS, configuring Security Groups and Environment Properties to ensure secure communication between the web tier and the RDS database.
