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

// Function to import files into the database etc.upload table but first selects the uid of the user who uploaded the file from the etc.user table
async function importDocuments(file) {
    const firstName = process.env.UPLOADED_BY.split(' ')[0];
    const lastName = process.env.UPLOADED_BY.split(' ')[1];
    console.log('Uploading file:', file, 'by',firstName, lastName);
    const getUserQuery = `SELECT uid FROM etc.user WHERE first_name LIKE $1 AND last_name LIKE $2`;
    const resultUser = await client.query(getUserQuery, [firstName, lastName]);
    const resultUserId = resultUser.rows[0].uid;
    console.log('User: ', resultUser);
    const getFileQuery = `SELECT load_id, date_upload FROM etc.product WHERE filename LIKE '%' || $1 || '%'`;
    const resultFile = await client.query(getFileQuery, [file]);
    if (resultFile.rows.length === 0) {
        console.log('No file found in the database matching:', file);
        return;
    }
    const load_id = resultFile.rows[0].load_id;
    const date_upload = resultFile.rows[0].date_upload;
    console.log('Load ID: ', load_id);
    const query = `INSERT INTO etc.upload (filename, date_upload, uid, uploaded_by, filepath, load_id) 
                    VALUES ($1, $2, $3, $4, $5, $6)`;
    const values = [file, date_upload, resultUserId, process.env.UPLOADED_BY, process.env.DESTINATION_PATH + '\\' + file, load_id];
    const results = await client.query(query, values);
    console.log('Row inserted: ', results);
    const fileName = file;
    const uploaded_by = process.env.UPLOADED_BY;
    const subject = 'IMPORT to etc.upload: ' + fileName + ' on ' + date_upload;
    let text = 'Hello ' + firstName + ' ' + lastName + ' uid: ' + resultUserId + ', File load_id: ' + load_id + ' with filename: ' + fileName + ' was successfully imported into the etc.upload table on ' + date_upload + '. Regards, \n' + uploaded_by;
    html = '<h1>Uploaded File</h1><p>' + 
        text + '</p>' + 
        '<p> Load Id: ' + 
        load_id  + 
        '</p>' + 
        '<p> Filename: ' + 
        fileName  + 
        '</p>' + 
        '<p> Uploaded By: ' + 
        uploaded_by  + 
        '</p>' + 
        '<p> Date Upload: ' + 
        date_upload  + 
        '</p>';
    ;
    // const emailObj = {
    //     date: date_upload,
    //     uuid: resultUserId,
    //     load_id: load_id,
    //     filename: fileName,
    //     uploaded_by: uploaded_by,
    //     subject: subject
    // }
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
            // move file to destination path
            fs.rename(directoryPath + '\\' + file, process.env.DESTINATION_PATH + '\\' + file, function(err) {
                if (err) {
                    console.log('Error renaming file: ', err);
                }
                console.log('File moved to destination path: ', process.env.DESTINATION_PATH + '\\' + file);
            });
        }
        await client.end();
        console.log('Connection ended: ', client.host, client.database, client.port, client.user, client.password);
    })();
});
