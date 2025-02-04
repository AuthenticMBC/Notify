// require('dotenv').config();
const https = require('https');
const fsSync = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { parse } = require('node-html-parser');

const courseNames = [
    'SOFTWARE ENGINEERING',
    'SUMMER TRAINING'
];
const facultativeCourseName = [
    'NATURAL LANGUAGE PROCESSING'
];


function GetArguments(argv) {
    const start = 2;
    let key_file = null;
    let checker = 0, interval = 0, multiplicator = 0;
    for (let i = start; i < argv.length; i++) {

        if (argv[i] === '--interval') {
            interval = Number(argv[++i]);
            checker++;
        }

        if (argv[i] === '--time_unit') {
            const time_unit = argv[++i];
            if (time_unit === 'h') { // Hour
                multiplicator = 60 * 60 * 1_000;
                checker++;
            } else if (time_unit === 'm') { // Minute
                multiplicator = 60 * 1_000;
                checker++;
            } else if (time_unit === 's') { // Seconde
                multiplicator = 1_000;
                checker++;
            } else if (time_unit === 'ms') { // Miliseconde
                multiplicator = 1;
                checker++;
            }
        }

        if (argv[i] === '--env_key') {
            key_file = argv[++i];
            checker++;
        }
    }

    if (checker != 3) { // We must pass 3 argument values
        let msg = `Usage: node index.js --interval <interval_number> --time_unit <time_unit> --env_key <key_file_name>\n`;
        msg += `Example --interval 30 --time_unit m\n`;
        msg += `time_unit\n`;
        msg += `h: hour\n`;
        msg += `m: minute\n`;
        msg += `s: seconde\n`;
        msg += `ms: millisecond`;
        throw Error(msg);
    }

    interval = interval * multiplicator;
    if (Number.isNaN(interval)) {
        throw Error(`Error: --interval value is not a number : ${interval}`);
    }

    return { interval, key_file };
}

function Encrypt(text, SECRET_KEY, ALGORITHM, IV_LENGTH) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET_KEY, 'utf-8'), iv);
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function Decrypt(encryptedText, SECRET_KEY, ALGORITHM) {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedTextBuffer = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET_KEY, 'utf-8'), iv);
    let decrypted = decipher.update(encryptedTextBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}


function LoadCookies(SECRET_KEY, ALGORITHM, IV_LENGTH) {
    const cookies = fsSync.readFileSync('cookies.txt', 'utf-8');
    const decryptedText = Decrypt(cookies, SECRET_KEY, ALGORITHM);
    return decryptedText;
}

function SaveCookies(cookies, SECRET_KEY, ALGORITHM, IV_LENGTH) {
    const encryptedText = Encrypt(cookies, SECRET_KEY, ALGORITHM, IV_LENGTH);
    fsSync.writeFileSync('cookies.txt', encryptedText);
}

function SendMail({ subject, message, env }) {
    const transporter = nodemailer.createTransport({
        host: env?.SMTP_SERVER_HOST,
        port: env?.SMTP_SERVER_PORT_TLS,
        auth: {
            user: env?.SENDER_EMAIL,
            pass: env?.SENDER_PASSWORD,
        }
    });

    const mailOptions = {
        from: env?.SENDER_EMAIL, // Sender address
        to: env?.RECIPIENT_EMAIL, // List of receivers
        subject: subject, // Subject line
        html: message // send HTML content
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) return console.log('Error:', error);
    });
}


function checkQuota(course, env) {
    const subject = 'REGISTRATION - FIND AN AVAILABLE QUOTA FOR COURSES';
    if (course.groups.length > 0) {
        course.groups.forEach((group, i) => {
            if (group.quota > 0) {
                let message = "<h1>Found Available course where you can register</h1> <br/>";
                message += `Course : ${course.courseName} | Quota : ${group.quota} | Group : ${i + 1}`;
                SendMail({ subject, message, env });
            }
        });
    } else {
        if (course.totalAvailableQuota > 0) {
            let message = "<h1>Found Available course where you can register</h1> <br/>";
            message += `Course : ${course.courseName} | Quota : ${course.totalAvailableQuota}`
            SendMail({ subject, message });
        }
    }
}


function FindAvailableCourses(courses, env) {
    courses.forEach(course => {
        if (courseNames.includes(course.courseName)) {
            checkQuota(course, env);
        } else if (course.courseName === 'FACULTY ELECTIVE') {
            const electives = course.electives;
            electives.forEach(elective => {
                if (facultativeCourseName.includes(elective.courseName)) {
                    checkQuota(elective, env)
                }
            });
        }
    });
}


function SendRequest(cookies, env, SECRET_KEY, ALGORITHM, IV_LENGTH) {
    const options = {
        hostname: env?.WEB_SERVER_HOST, // The server hostname
        port: env?.WEB_SERVER_PORT, // Default port for HTTPS
        path: env?.WEB_SERVER_PATH, // The path of the resource
        method: 'GET', // HTTP method
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Connection': 'keep-alive',
            'Cookie': cookies,
            'Host': env?.WEB_SERVER_HOST,
            'Referer': env?.REFER_HEADER,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
            'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
        },
    };
    newCookiesToSave = '';
    // Create the request
    const req = https.request(options, async (res) => {
        let data = [];
        const newCookiesList = res.headers['set-cookie'];
        const COOKIE1 = newCookiesList[0].match(/^([^;]*)/)[1];
        const COOKIE2 = newCookiesList[1].match(/^([^;]*)/)[1];
        newCookiesToSave = COOKIE1;
        newCookiesToSave = newCookiesToSave.concat(`;${COOKIE2}`);

        res.on('data', (chunk) => {
            data.push(chunk);
        });

        res.on('end', () => {
            SaveCookies(newCookiesToSave, SECRET_KEY, ALGORITHM, IV_LENGTH);
            const buff = Buffer.concat(data);

            zlib.gunzip(buff, (err, decompressed) => {
                if (err) {
                    console.error('Error during decompression: ', err);
                } else {
                    const html = decompressed.toString('utf8');
                    const root = parse(html);
                    const scriptTag = root.querySelectorAll('script[type="text/javascript"]');

                    if (scriptTag) {
                        scriptTag.forEach(async element => {
                            const scriptContent = element.text;
                            const regex = /\$scope\.data\s*=\s*(\{[\s\S]*?\});?\s*$/m;
                            const match = scriptContent.match(regex);
                            if (match) {
                                const jsonString = match[1].trim();
                                try {
                                    // Parse the JSON string into an object
                                    const jsonData = JSON.parse(jsonString);
                                    const courses = jsonData.curriculum.courses;
                                    FindAvailableCourses(courses, env);
                                } catch (jsonErr) {
                                    console.error('Error parsing JSON:', jsonErr);
                                }
                            }
                        });
                    }
                }
            });
        });
    });

    // Handle errors
    req.on('error', (e) => {
        console.error('Error:', e.message);
    });

    // End the request
    req.end();
}

function GetEnv(SECRET_KEY, ALGORITHM) {
    const encryptedText = fsSync.readFileSync('.env').toString('utf-8');
    const decryptedText = Decrypt(encryptedText, SECRET_KEY, ALGORITHM);
    const lines = decryptedText.split('\n');
    const env = {};
    lines.forEach(line => {
        let name = line.split('=')[0];
        let val = line.split('=')[1];
        env[name] = val
    })
    return env;
}

function run(env, SECRET_KEY, ALGORITHM, IV_LENGTH) {
    try {
        let Cookies = LoadCookies(SECRET_KEY, ALGORITHM, IV_LENGTH);
        SendRequest(Cookies, env, SECRET_KEY, ALGORITHM, IV_LENGTH);
    } catch (error) {
        SendMail({
            subject: 'AN ERROR OCCURS ON SCHOOL ALERT SERVICE !!!',
            message: error
        });
    }
}

try {
    const { interval, key_file } = GetArguments(process.argv);
    const config = fsSync.readFileSync(key_file);
    const { SECRET_KEY, ALGORITHM, IV_LENGTH } = JSON.parse(config.toString('utf-8'));
    fsSync.unlinkSync(key_file);
    const env = GetEnv(SECRET_KEY, ALGORITHM);

    if (interval === 0) {
        run(env, SECRET_KEY, ALGORITHM, IV_LENGTH);
    } else {
        setInterval(() => {
            run(env, SECRET_KEY, ALGORITHM, IV_LENGTH);
        }, interval);
    }
} catch (error) {
    process.exitCode = 1;
    console.log(error);
}