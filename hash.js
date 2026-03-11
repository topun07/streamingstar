// hash.js
const bcrypt = require('bcryptjs');
const password = "@Metallica3"; // <--- CHANGE THIS
const salt = bcrypt.genSaltSync(10);
const hash = bcrypt.hashSync(password, salt);
console.log("Your new hash is:");
console.log(hash);