const fs = require('fs');
// const path = require('path');
const { Client } = require('pg');
// Load environment variables from a .env file into process.env
require('dotenv').config({ path: '.env' })

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

// Function to import files into the database etc.documents table but first selects the uid of the user who uploaded the file from the etc.users table
async function importDocuments(file) {
    const firstName = process.env.UPLOADED_BY.split(' ')[0];
    const lastName = process.env.UPLOADED_BY.split(' ')[1];
    console.log('Uploading file:', file, 'by',firstName, lastName);
    const getUserQuery = `SELECT uid FROM etc.users WHERE first_name LIKE $1 AND last_name LIKE $2`;
    const resultUser = await client.query(getUserQuery, [firstName, lastName]);
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
    const values = [file, date_upload, resultUser.rows[0].uid, process.env.UPLOADED_BY, directoryPath + '/' + file, load_id];
    const results = await client.query(query, values);
    console.log('Row inserted: ', results);
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
