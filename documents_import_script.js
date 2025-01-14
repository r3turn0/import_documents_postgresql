const fs = require('fs');
// const path = require('path');
const { Client } = require('pg');
// Load environment variables from a .env file into process.env
require('dotenv').config({ path: '.env' });
const nodemailer = require('nodemailer');

// Use this to import files from a docs directory into a PostgreSQL database
const directoryPath = './'+ process.env.DIRECTORY_PATH;
console.log('Importing files from directory: ', directoryPath);
// Build the connection string using environment variables
const connectionString = 'postgresql://' + process.env.DB_USER + ":" + process.env.DB_USER_PASSWORD + "@" + process.env.DB_HOST + ":" + process.env.DB_PORT + "/" + process.env.DB_NAME;
console.log('Using connection string: ', connectionString);
// Create a new PostgreSQL client
const client = new Client({
    connectionString: connectionString,
});
// Create a transporter object using SMTP transport
let transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: process.env.SMTP_SERVER_PORT,
    secure: true, // true for port 465, false for other ports
    service: process.env.SMTP_SERVER, // You can use other services like Yahoo, Outlook, etc.
    auth: {
        user: process.env.SMTP_USER, // Your email address
        pass: process.env.SMTP_PASSWORD   // Your email password
    }
});
let mailOptions = {
    from: '"' + process.env.UPLOADED_BY + '" ' + process.env.SMTP_USER, // Sender address
    to: process.env.SMTP_TO,          // List of recipients
    // subject: 'Hello from Node.js',              // Subject line
    // text: 'Hello world?',                       // Plain text body
    // html: '<b>Hello world?</b>'                 // HTML body
};

// Function to import files into the database etc.documents table but first selects the uid of the user who uploaded the file from the etc.users table
async function importDocuments(file) {
    const firstName = process.env.UPLOADED_BY.split(' ')[0];
    const lastName = process.env.UPLOADED_BY.split(' ')[1];
    console.log('Uploading file:', file, 'by',firstName, lastName);
    const getUserQuery = `SELECT uid FROM etc.users WHERE first_name LIKE $1 AND last_name LIKE $2`;
    const resultUser = await client.query(getUserQuery, [firstName, lastName]);
    const resultUserId = resultUser.rows[0].uid;
    console.log('User: ', resultUser);
    const getFileQuery = `SELECT load_id, date_upload FROM etc.products WHERE filename LIKE '%' || $1 || '%'`;
    const resultFile = await client.query(getFileQuery, [file]);
    if (resultFile.rows.length === 0) {
        console.log('No file found in the database matching:', file);
        return;
    }
    const load_id = resultFile.rows[0].load_id;
    const date_upload = resultFile.rows[0].date_upload;
    console.log('Load ID: ', load_id);
    const query = `INSERT INTO etc.documents (filename, date_upload, uid, uploaded_by, filepath, load_id) 
                    VALUES ($1, $2, $3, $4, $5, $6)`;
    const values = [file, date_upload, resultUserId, process.env.UPLOADED_BY, directoryPath + '/' + file, load_id];
    const results = await client.query(query, values);
    console.log('Row inserted: ', results);
    const fileName = file;
    const uploaded_by = process.env.UPLOADED_BY;
    const subject = 'etc.documents IMPORT: ' + fileName + ' on ' + date_upload;
    let text = 'Hello ' + firstName + ' id: ' + resultUserId + ',\n\n' + load_id + ' ' + fileName + ' was successfully imported into the etc.documents table on ' + date_upload + '.\n\n' + 'Regards,\n' + process.env.UPLOADED_BY;
    let html = '<h1> Document file Import</h1><p>' + text + '</p>';
    const emailObj = {
        date: date_upload,
        uuid: resultUserId,
        load_id: load_id,
        filename: fileName,
        uploaded_by: uploaded_by,
        subject: subject
    }
    mailOptions.subject = subject;
    mailOptions.text = text;
    mailOptions.html = html;
    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

// Read all files in the docs directory and import them into the database
fs.readdir(directoryPath, (err, files) => {
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    }
    // async function to connect to the database, import the files and then disconnect
    (async() => {
        await client.connect();
        console.log('Connected to: ', client.host, client.database, client.port, client.user, client.password);
        for (const file of files) {
            console.log('Processing file: ', file);
            await importDocuments(file);
            console.log('File imported: ', file);
        }
        await client.end();
        console.log('Connection ended: ', client.host, client.database, client.port, client.user, client.password);
    })();
});
