const corsMiddleware = require('restify-cors-middleware');
const restify = require('restify');
const mongoose = require('mongoose');
const SerialPort = require('serialport');
require('dotenv').config();

const server = restify.createServer({
    name: 'bank_back-end',
    version: '3.0.0'
});

const cors = corsMiddleware({
    origins: ["*"],
    allowHeaders: ['Authorization'],
    exposeHeaders: ['Authorization']
});

server.pre(cors.preflight);
server.use(cors.actual);
server.use(restify.plugins.bodyParser());

/**SERIAL
 * Definitions for receipt printer and dispsenser
 */
// const pPort = new SerialPort('', { baudRate: 9600 });
// const dPort = new SerialPort('', { baudRate: 9600 });


/**MONGOOSE CONNECTION */
// LOCALHOST
// mongoose.connect('mongodb://localhost:27017/sber', { useNewUrlParser: true })
//     .then(() => {
//         console.log('[LOG]::[CONNECTION]::CONNECTED - LOCAL\n');
//     })
//     .catch((error) => {
//         console.log('\n[LOG]::[CONNECTION]::CONNECTION FAILED - LOCAL')
//         console.log(error)
//     });

// MONGODB ATLAS - Direct route
const { DB_PASS } = process.env;

mongoose.connect(`mongodb+srv://AJKZ:${DB_PASS}@cluster-hr-sber-gpvua.mongodb.net/sber?retryWrites=true&w=majority`, { useNewUrlParser: true })
    .then(() => {
        console.log('[LOG]::[CONNECTION]::CONNECTED - CLOUD\n');
    })
    .catch(function handleMongooseError(error) {
        console.log('\n[LOG]::[CONNECTION]::CONNECTION FAILED.')
        console.log(error);
    });

// MONGODB ATLAS - Hidden env
// const { DB_HOST, DB_NAME, DB_USER, DB_PASS } = process.env;
// const connection = `mongodb+srv://${DB_USER}:${DB_PASS}@${DB_HOST}/${DB_NAME}`
// mongoose.connect(connection, { useNewUrlParser: true })
//     .then (() => {
//         console.log('[LOG]::[CONNECTION]::CONNECTED - CLOUD\n');
//     })
//     .catch(function handleMongooseError(error) {
//         console.log('\n[LOG]::[CONNECTION]::CONNECTION FAILED.')
//         console.log(error)
//     });


/**MONGOOSE-MONGODB MODELS */
// Users
const User = mongoose.model('User', {
    iban: String,
    pin: String,
    attempts: Number,
    balance: Number
});

// Transactions
const Transaction = mongoose.model('Transaction', {
    iban: String,
    amount: Number,
    location: String,
    time: Date
});


/**GLOBAL */
const MAX_LOGIN_ATTEMPTS = 3;


/**IBAN VALIDATION */
function validateIban(iban) {
    const ibanUpper = iban.toUpperCase()

    const countryCode = iban.substring(0,2)
    const controlNumber = iban.substring(2,4)
    const bankCode = iban.substring(4,8)
    const bankPassNumber = iban.substring(8,14)

    const countryCodeRotated = ibanUpRot(countryCode)
    const bankCodeRotated = ibanUpRot(bankCode)

    const ibanValidated = calcControlNum(`${bankCodeRotated}${bankPassNumber}${countryCodeRotated}${controlNumber}`)

    if(ibanValidated != 1){
      return false
    }
    return true
}

function ibanUpRot(str) {
    return str.split("")
      .map((v) => v.charCodeAt(0) + 9 - 64)
      .reduce((acc, curr) => {
      return acc += curr.toString()
      })
 }

function calcControlNum(input){
    const ls = (parseInt(input.substring(0, 10)) % 97) * 10 ** 10
    const rs = parseInt(input.substring(10, 20))
    const total = ls + rs
    return total % 97
}


/**REQUEST HANDLING */
/**
 * Checks whether the IBAN in the request is valid,
 * looks in the database if the IBAN exists,
 * checks if the existing IBAN is blocked or not.
 */
server.post('/validate', (req, res, next) => {
    const reqIBAN = req.body.iban;
    
    // check if IBAN valid
    if(validateIban(reqIBAN) == false) {
        console.log('\n[LOG]::[VALIDATION]::INVALID IBAN');
        res.send(403, 'Invalid IBAN.\n');
    }
    else {
        // find user with specified IBAN
        return User.findOne({$and: [{ iban: reqIBAN }]})
            // if found
            .then((existingAccount) => {
                console.log('\n[LOG]::[VALIDATION]::ACCOUNT FOUND');
                console.log(existingAccount);
                // check if it's not blocked
                if(existingAccount.attempts > 2) {
                    res.send(401);
                }
                else {
                    res.send(200);
                }
            })
            // iban not found
            .catch((error) => {
                console.log('\n[LOG]::[VALIDATION]::IBAN DOES NOT EXIST')
                console.log(error);
                res.send(403, error);
            });
    }
});

/**
 * Simple log in functionality
 * Checks IBAN and PIN combination,
 * if combination doesn't match, will increment log in attempts on IBAN.
 * On success, will reset log in attempts.
 */
server.post('/login', (req, res, next) => {
    const reqIBAN = req.body.iban;
    const reqPIN = req.body.pin;

    // check IBAN-PIN combination
    return User.findOne({$and: [{ iban: reqIBAN }, { pin: reqPIN }]})
        // check if there exists any documents with this information
        .then((result) => {
            console.log('\n[LOG]::[LOGIN]::FIND IBAN AND PIN COMBINATION');
            console.log(result)

            // if combination is invalid
            if(result == null) {
                console.log('\n[LOG]::[LOGIN]::IBAN AND PIN COMBINATION NOT FOUND');
                console.log('[LOG]::[LOGIN]::INCREMENTING LOG IN ATTEMPTS');

                // increment attempts on IBAN
                User.findOneAndUpdate({$and: [{ iban: reqIBAN }]}, { $inc: { attempts: 1 }})
                    // incremented
                    .then((result) => {
                        console.log('\n[LOG]::[LOGIN]::LOG IN ATTEMPTS INCREMENTED');
                        console.log(result);
                        res.send(401, 'Incorrect PIN');
                    })
                    // unable to increment
                    .catch((error) => {
                        console.log('\n[LOG]::[LOGIN]::COULD NOT INCREMENT LOG IN ATTEMPTS');
                        console.log(error);
                    })
            }
            else {
                User.findOneAndUpdate({$and: [{ iban: reqIBAN }]}, { attempts: 0 }) 
                .then((result) => {
                    console.log('\n[LOG]::[LOGIN]::LOG IN SUCCESS, ATTEMPTS RESET');
                    res.send(200, result);
                })
                .catch((error) => {
                    console.log('\n[LOG]::[LOGIN]::UNABLE TO FIND IBAN');
                    console.log(error);
                });
            }
        })
        .catch((error) => {
            console.log('\n[LOG]:[LOGIN]:COULD NOT CONDUCT SEARCH ON IBAN-PIN COMBINATION');
            console.log(error);
        });
});

/**
 * Simply returns the balance of requested IBAN
 */
server.post('/getbalance', (req, res, next) => {
    const iban = req.body.iban;

    // retrieve IBAN
    return User.findOne({$and: [{iban: iban}]})
        // success
        .then((result) => {
            console.log('\n[LOG]::[GET BALANCE]::SUCESSFULLY RETRIEVED');
            console.log(result);
            res.send(200, result.balance);
        })
        // failure
        .catch((error) => {
            console.log('\n[LOG]::[GET BALANCE]::RETRIEVAL FAILED');            
            console.log(error);
            res.send(error);
        });
});

/**
 * Checks IBAN for balance,
 * if balance is too low, withdrawal does not continue
 * if balance is sufficient, simply continues with transaction.
 * On success, creates transaction document in DB.
 */
server.post('/withdraw', (req, res, next) => {
    const iban = req.body.iban;
    const amount = req.body.amount;

    // find user IBAN
    User.findOne({$and: [{iban: iban}]})
        // user found
        .then((user) => {
            // user balance too low
            if(amount > user.balance) {
                console.log('\n[LOG]::[WITHDRAWAL]::USER BALANCE TOO LOW')
                res.send(412, 'Balance too low.\n');
            }
            else {
                // subtract amount from balance
                User.findOneAndUpdate({$and: [{ iban: iban }]}, { $inc: { balance: -amount } }, { new: true })
                    .then(() => {
                        //create a transaction document in database
                        Transaction.create({
                            iban: iban,
                            amount: amount,
                            location: "SBER-ATM01",
                            time: new Date()
                        })
                        .then((result) => {
                            console.log('\n[LOG]::[WITHDRAWAL]::[TRANSACTION]::TRANSACTION RECORD CREATED')
                            console.log(result)
                            res.send(200, result);
                        })
                        .catch((error) => {
                            console.log('\n[LOG]::[WITHDRAWAL]::[TRANSACTION]::COULD NOT CREATE TRANSACTION RECORD');
                            console.log(error);
                        });
                    })
                    .catch((error) => {
                        console.log('\n[LOG]::[WITHDRAWAL]::ERROR IN SUBTRACTION');
                        console.log(error);
                    });
            }
        })
        .catch((error) => {
            console.log('\n[LOG]::[WITHDRAWAL]::COULD NOT FIND IBAN');
            console.log(error);
        })
});


/**SET PORT */
server.listen(8080, () => {
    console.log('%s listening at %s', server.name, server.url);
});
